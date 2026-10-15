
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

const botoesTeste = [
  document.getElementById("teste30"),
  document.getElementById("teste90"),
  document.getElementById("teste150")
];

const ANGULO_MIN = 30;
const ANGULO_MAX = 150;
const INTERVALO_ENVIO = 100;

const conexoes = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

let portaSerial = null;
let escritorSerial = null;
let hands = null;
let conectado = false;
let enviando = false;
let ultimaMensagem = "";
let ultimoEnvio = 0;
let mensagemPendente = null;

function atualizarBotoes() {
  botoesTeste.forEach(botao => {
    botao.disabled = !conectado;
  });

  botaoConectar.disabled = conectado;
  botaoDesconectar.disabled = !conectado;
}

function desenharMao(mao) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#00ff88";

  for (const [aIndice, bIndice] of conexoes) {
    const a = mao[aIndice];
    const b = mao[bIndice];

    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  }

  mao.forEach((ponto, indice) => {
    ctx.beginPath();
    ctx.arc(
      ponto.x * canvas.width,
      ponto.y * canvas.height,
      indice === 0 ? 8 : 5,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = indice === 0 ? "#ffcc00" : "#ffffff";
    ctx.fill();
  });
}

// Calcula o ângulo entre três pontos 2D.
function calcularAngulo(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const denominador =
    Math.hypot(abx, aby) * Math.hypot(cbx, cby);

  if (denominador === 0) return 180;

  const cos = Math.max(
    -1,
    Math.min(
      1,
      (abx * cbx + aby * cby) / denominador
    )
  );

  return Math.acos(cos) * 180 / Math.PI;
}

// Dedo estendido -> servo perto de 30°.
// Dedo dobrado -> servo perto de 150°.
function mapearParaServo(flexao) {
  const valor = 30 + ((180 - flexao) / 110) * 120;

  return Math.round(
    Math.max(ANGULO_MIN, Math.min(ANGULO_MAX, valor))
  );
}

function calcularAngulos(mao) {
  // Indicador: MCP 5, PIP 6, DIP 7.
  const flexaoIndicador =
    calcularAngulo(mao[5], mao[6], mao[7]);

  // Polegar: MCP 2, IP 3, ponta 4.
  const flexaoDedao =
    calcularAngulo(mao[2], mao[3], mao[4]);

  // Médio: MCP 9, PIP 10, DIP 11.
  const flexaoMedio =
    calcularAngulo(mao[9], mao[10], mao[11]);

  return {
    indicador: mapearParaServo(flexaoIndicador),
    dedao: mapearParaServo(flexaoDedao),
    medio: mapearParaServo(flexaoMedio),
    flexaoIndicador: Math.round(flexaoIndicador)
  };
}

async function processarFilaSerial() {
  if (enviando || !escritorSerial || !conectado) return;

  enviando = true;

  try {
    while (
      mensagemPendente !== null &&
      escritorSerial &&
      conectado
    ) {
      const mensagem = mensagemPendente;
      mensagemPendente = null;

      await escritorSerial.write(
        new TextEncoder().encode(mensagem + "\n")
      );
    }
  } catch (erro) {
    console.error("Erro na comunicação serial:", erro);
    statusArduino.textContent =
      "Falha ao enviar comandos. Confira o cabo USB.";
  } finally {
    enviando = false;
  }
}

function enviarAngulos(angulos, forcar = false) {
  if (!conectado || !escritorSerial) return;

  const agora = Date.now();

  if (agora - ultimoEnvio < INTERVALO_ENVIO && !forcar) return;

  const mensagem =
    `${angulos.indicador},${angulos.dedao},${angulos.medio}`;

  if (mensagem === ultimaMensagem && !forcar) return;

  ultimaMensagem = mensagem;
  ultimoEnvio = agora;
  mensagemPendente = mensagem;

  processarFilaSerial();
}

async function enviarTeste(angulo) {
  enviarAngulos({
    indicador: angulo,
    dedao: angulo,
    medio: angulo
  }, true);
}

botaoConectar.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    statusArduino.textContent =
      "Web Serial indisponível. Abra a página em Chrome compatível e HTTPS.";
    return;
  }

  botaoConectar.disabled = true;

  try {
    statusArduino.textContent = "Selecione o Arduino na janela...";

    portaSerial = await navigator.serial.requestPort();
    await portaSerial.open({ baudRate: 9600 });

    if (!portaSerial.writable) {
      throw new Error("A porta serial não permite escrita.");
    }

    escritorSerial = portaSerial.writable.getWriter();
    conectado = true;
    ultimaMensagem = "";

    statusArduino.textContent =
      "Arduino conectado — 3 servos ativos.";
  } catch (erro) {
    console.error(erro);

    statusArduino.textContent =
      "Não foi possível conectar: " + erro.message;

    conectado = false;
  } finally {
    atualizarBotoes();
  }
});

botaoDesconectar.addEventListener("click", async () => {
  conectado = false;
  mensagemPendente = null;

  try {
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
    statusArduino.textContent =
      "Erro ao desconectar: " + erro.message;
  } finally {
    atualizarBotoes();
  }
});

document.getElementById("teste30").addEventListener(
  "click", () => enviarTeste(30)
);

document.getElementById("teste90").addEventListener(
  "click", () => enviarTeste(90)
);

document.getElementById("teste150").addEventListener(
  "click", () => enviarTeste(150)
);

function aoDetectar(resultado) {
  const largura = video.videoWidth;
  const altura = video.videoHeight;

  if (!largura || !altura) return;

  if (canvas.width !== largura || canvas.height !== altura) {
    canvas.width = largura;
    canvas.height = altura;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, largura, altura);

  const maos = resultado.multiHandLandmarks;

  if (!maos || maos.length === 0) {
    status.textContent = "Mostre sua mão para a câmera.";
    flexaoTexto.textContent = "--°";
    pontosTexto.textContent = "0 / 21";
    return;
  }

  const mao = maos[0];

  desenharMao(mao);

  pontosTexto.textContent = mao.length + " / 21";

  const angulos = calcularAngulos(mao);

  flexaoTexto.textContent =
    angulos.flexaoIndicador + "°";

  anguloTexto.textContent =
    angulos.indicador + "°";

  status.textContent = conectado
    ? `Controle ativo — indicador ${angulos.indicador}°, dedão ${angulos.dedao}°, médio ${angulos.medio}°.`
    : "Mão detectada — conecte o Arduino.";

  enviarAngulos(angulos);
}

async function iniciarMediaPipe() {
  try {
    if (typeof Hands === "undefined") {
      throw new Error("Biblioteca MediaPipe não carregada.");
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

    status.textContent = "MediaPipe carregado. Detectando mão...";

    async function analisar() {
      if (video.readyState >= 2 && hands) {
        try {
          await hands.send({ image: video });
        } catch (erro) {
          console.error("Erro no MediaPipe:", erro);
        }
      }

      requestAnimationFrame(analisar);
    }

    analisar();
  } catch (erro) {
    console.error(erro);
    status.textContent = "Erro ao iniciar MediaPipe: " + erro.message;
  }
}

async function iniciarCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Câmera indisponível. Abra a página em HTTPS."
      );
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

    placeholder.classList.add("hidden");
    status.textContent = "Carregando MediaPipe...";

    iniciarMediaPipe();
  } catch (erro) {
    console.error(erro);
    status.textContent = "Erro ao iniciar câmera: " + erro.message;
    placeholder.textContent = "Não foi possível iniciar a câmera.";
  }
}

atualizarBotoes();
iniciarCamera();
