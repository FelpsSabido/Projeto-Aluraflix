
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const status = document.getElementById("status");
const statusArduino = document.getElementById("statusArduino");
const placeholder = document.getElementById("cameraPlaceholder");

const flexaoTexto = document.getElementById("flexao");
const anguloTexto = document.getElementById("angulo");
const pontosTexto = document.getElementById("pontos");

const botaoConectar = document.getElementById("conectarArduino");
const botaoDesconectar = document.getElementById("desconectarArduino");
const botaoTeste30 = document.getElementById("teste30");
const botaoTeste90 = document.getElementById("teste90");
const botaoTeste150 = document.getElementById("teste150");

const conexoes = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const LIMITES = {
  indicador: { minimo: 0, maximo: 180 },
  dedao: { minimo: 0, maximo: 180 },
  medio: { minimo: 0, maximo: 180 }
};

const INTERVALO_ENVIO = 100;
const MUDANCA_MINIMA = 2;

let portaSerial = null;
let escritorSerial = null;
let leitorSerial = null;
let hands = null;
let conectado = false;
let lendoSerial = false;
let ultimaMensagem = "";
let ultimoEnvio = 0;
let ultimosAngulos = null;
let ultimoAnguloCalculado = null;
let modoTeste = false;

function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function atualizarBotoes() {
  if (botaoConectar) botaoConectar.disabled = conectado;
  if (botaoDesconectar) botaoDesconectar.disabled = !conectado;

  [botaoTeste30, botaoTeste90, botaoTeste150].forEach(botao => {
    if (botao) botao.disabled = !conectado;
  });
}

function desenharMao(mao) {
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 3;

  for (const [i, j] of conexoes) {
    ctx.beginPath();
    ctx.moveTo(mao[i].x * canvas.width, mao[i].y * canvas.height);
    ctx.lineTo(mao[j].x * canvas.width, mao[j].y * canvas.height);
    ctx.stroke();
  }

  mao.forEach((ponto, i) => {
    ctx.beginPath();
    ctx.arc(
      ponto.x * canvas.width,
      ponto.y * canvas.height,
      i === 0 ? 8 : 5,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = i === 0 ? "#ffcc00" : "#ffffff";
    ctx.fill();
  });
}

function calcularAngulo(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const denominador =
    Math.hypot(abx, aby) * Math.hypot(cbx, cby);

  if (denominador === 0) return 180;

  const cos = limitar(
    (abx * cbx + aby * cby) / denominador,
    -1,
    1
  );

  return Math.acos(cos) * 180 / Math.PI;
}

function mapearParaServo(flexao, nome) {
  const limites = LIMITES[nome];

  // Articulação reta -> servo 0.
  // Articulação dobrada -> servo 180.
  const proporcao = limitar((180 - flexao) / 110, 0, 1);

  return Math.round(
    limites.minimo +
    proporcao * (limites.maximo - limites.minimo)
  );
}

function calcularAngulos(mao) {
  const anguloIndicador = calcularAngulo(mao[5], mao[6], mao[7]);
  const anguloDedao = calcularAngulo(mao[2], mao[3], mao[4]);
  const anguloMedio = calcularAngulo(mao[9], mao[10], mao[11]);

  return {
    indicador: mapearParaServo(anguloIndicador, "indicador"),
    dedao: mapearParaServo(anguloDedao, "dedao"),
    medio: mapearParaServo(anguloMedio, "medio"),
    flexaoIndicador: Math.round(180 - anguloIndicador)
  };
}

function angulosMudaram(novos, antigos) {
  if (!antigos) return true;

  return (
    Math.abs(novos.indicador - antigos.indicador) >= MUDANCA_MINIMA ||
    Math.abs(novos.dedao - antigos.dedao) >= MUDANCA_MINIMA ||
    Math.abs(novos.medio - antigos.medio) >= MUDANCA_MINIMA
  );
}

async function enviarMensagem(mensagem) {
  if (!conectado || !escritorSerial) {
    if (statusArduino) statusArduino.textContent = "Conecte o Arduino primeiro.";
    return false;
  }

  try {
    await escritorSerial.write(
      new TextEncoder().encode(mensagem + "\n")
    );

    if (statusArduino) {
      statusArduino.textContent = "Comando enviado: " + mensagem;
    }

    console.log("Enviado ao Arduino:", mensagem);
    return true;
  } catch (erro) {
    console.error("Erro ao enviar comando:", erro);

    if (statusArduino) {
      statusArduino.textContent = "Erro no envio: " + erro.message;
    }

    return false;
  }
}

async function enviarAngulos(angulos, forcar = false) {
  if (!conectado || !escritorSerial) return;

  const agora = Date.now();

  if (!forcar && agora - ultimoEnvio < INTERVALO_ENVIO) return;
  if (!forcar && !angulosMudaram(angulos, ultimosAngulos)) return;

  const mensagem =
    `${angulos.indicador},${angulos.dedao},${angulos.medio}`;

  if (!forcar && mensagem === ultimaMensagem) return;

  // Evita que a câmera envie comandos durante o teste manual.
  if (modoTeste && !forcar) return;

  const enviado = await enviarMensagem(mensagem);

  if (enviado) {
    ultimaMensagem = mensagem;
    ultimoEnvio = Date.now();
    ultimosAngulos = { ...angulos };
  }
}

async function testarServos(angulo) {
  if (!conectado) return;

  modoTeste = true;

  const enviado = await enviarAngulos({
    indicador: angulo,
    dedao: angulo,
    medio: angulo
  }, true);

  if (enviado) {
    statusArduino.textContent =
      `Teste enviado: indicador ${angulo}°, dedão ${angulo}°, médio ${angulo}°.`;

    // Retoma o controle pela câmera após o teste.
    setTimeout(() => {
      modoTeste = false;
      ultimosAngulos = null;
    }, 1200);
  } else {
    modoTeste = false;
  }
}

if (botaoTeste30) {
  botaoTeste30.addEventListener("click", () => testarServos(30));
}
if (botaoTeste90) {
  botaoTeste90.addEventListener("click", () => testarServos(90));
}
if (botaoTeste150) {
  botaoTeste150.addEventListener("click", () => testarServos(150));
}

async function lerRespostasArduino() {
  if (!portaSerial || !portaSerial.readable || lendoSerial) return;

  lendoSerial = true;

  try {
    leitorSerial = portaSerial.readable.getReader();
    let buffer = "";

    while (conectado) {
      const { value, done } = await leitorSerial.read();

      if (done) break;
      if (!value) continue;

      buffer += new TextDecoder().decode(value);

      const linhas = buffer.split(/\r?\n/);
      buffer = linhas.pop() || "";

      for (const linha of linhas) {
        const resposta = linha.trim();
        if (!resposta) continue;

        console.log("Arduino respondeu:", resposta);

        if (statusArduino) {
          statusArduino.textContent = "Arduino: " + resposta;
        }
      }
    }
  } catch (erro) {
    if (conectado) console.error("Erro lendo Arduino:", erro);
  } finally {
    if (leitorSerial) {
      try {
        leitorSerial.releaseLock();
      } catch (_) {}
      leitorSerial = null;
    }

    lendoSerial = false;
  }
}

if (botaoConectar) {
  botaoConectar.addEventListener("click", async () => {
    if (!("serial" in navigator)) {
      statusArduino.textContent =
        "Este navegador não oferece acesso serial. Use um navegador compatível com Web Serial.";
      return;
    }

    botaoConectar.disabled = true;

    try {
      statusArduino.textContent = "Selecione o Arduino...";

      portaSerial = await navigator.serial.requestPort();
      await portaSerial.open({ baudRate: 9600 });

      if (!portaSerial.writable) {
        throw new Error("A porta serial não permite escrita.");
      }

      escritorSerial = portaSerial.writable.getWriter();
      conectado = true;
      ultimaMensagem = "";
      ultimosAngulos = null;

      atualizarBotoes();
      statusArduino.textContent = "Arduino conectado. Teste os servos.";

      // Inicia a leitura das respostas sem bloquear a interface.
      lerRespostasArduino();
    } catch (erro) {
      console.error(erro);
      statusArduino.textContent = "Erro ao conectar: " + erro.message;

      conectado = false;
      atualizarBotoes();
    }
  });
}

if (botaoDesconectar) {
  botaoDesconectar.addEventListener("click", async () => {
    conectado = false;
    modoTeste = false;

    try {
      if (leitorSerial) {
        try {
          await leitorSerial.cancel();
        } catch (_) {}
      }

      if (escritorSerial) {
        escritorSerial.releaseLock();
        escritorSerial = null;
      }

      if (portaSerial) {
        await portaSerial.close();
        portaSerial = null;
      }

      statusArduino.textContent = "Arduino desconectado.";
    } catch (erro) {
      console.error(erro);
      statusArduino.textContent = "Erro ao desconectar: " + erro.message;
    } finally {
      atualizarBotoes();
    }
  });
}

function aoDetectar(resultado) {
  const largura = video.videoWidth;
  const altura = video.videoHeight;

  if (!largura || !altura) return;

  if (canvas.width !== largura || canvas.height !== altura) {
    canvas.width = largura;
    canvas.height = altura;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const maos = resultado.multiHandLandmarks;

  if (!maos || maos.length === 0) {
    status.textContent = "Mostre sua mão para a câmera.";
    flexaoTexto.textContent = "--°";
    anguloTexto.textContent = "--°";
    pontosTexto.textContent = "0 / 21";
    return;
  }

  const mao = maos[0];
  desenharMao(mao);
  pontosTexto.textContent = `${mao.length} / 21`;

  const angulos = calcularAngulos(mao);
  ultimoAnguloCalculado = angulos;

  flexaoTexto.textContent = `${angulos.flexaoIndicador}°`;
  anguloTexto.textContent = `${angulos.indicador}°`;

  status.textContent = conectado
    ? `Controle ativo — indicador ${angulos.indicador}°, dedão ${angulos.dedao}°, médio ${angulos.medio}°.`
    : "Mão detectada — conecte o Arduino.";

  enviarAngulos(angulos);
}

async function iniciarMediaPipe() {
  try {
    if (typeof Hands === "undefined") {
      throw new Error("A biblioteca MediaPipe não foi carregada.");
    }

    hands = new Hands({
      locateFile: arquivo =>
        "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + arquivo
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    hands.onResults(aoDetectar);
    status.textContent = "Reconhecimento carregado. Mostre sua mão.";

    async function analisar() {
      if (video.readyState >= 2 && hands) {
        try {
          await hands.send({ image: video });
        } catch (erro) {
          console.error("Erro no reconhecimento:", erro);
        }
      }

      requestAnimationFrame(analisar);
    }

    analisar();
  } catch (erro) {
    console.error(erro);
    status.textContent = "Erro no MediaPipe: " + erro.message;
  }
}

async function iniciarCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("A câmera exige uma página HTTPS ou contexto seguro.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    if (placeholder) placeholder.classList.add("hidden");

    status.textContent = "Carregando reconhecimento da mão...";
    iniciarMediaPipe();
  } catch (erro) {
    console.error(erro);
    status.textContent = "Erro ao iniciar câmera: " + erro.message;

    if (placeholder) {
      placeholder.textContent = "Não foi possível iniciar a câmera.";
    }
  }
}

atualizarBotoes();
iniciarCamera();
