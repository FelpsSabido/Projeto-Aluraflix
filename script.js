
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
const VARIACAO_MINIMA = 3;

let portaSerial = null;
let escritorSerial = null;
let hands = null;

let ultimoAnguloEnviado = null;
let ultimoEnvio = 0;
let anguloPendente = null;
let enviando = false;
let conectado = false;

const conexoes = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

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

  for (const [indiceA, indiceB] of conexoes) {
    const a = mao[indiceA];
    const b = mao[indiceB];

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

function mapearParaServo(flexao) {
  const valor = 30 + (180 - flexao);

  return Math.round(
    Math.max(ANGULO_MIN, Math.min(ANGULO_MAX, valor))
  );
}

async function processarFilaSerial() {
  if (enviando || !escritorSerial || !conectado) return;

  enviando = true;

  try {
    while (
      anguloPendente !== null &&
      escritorSerial &&
      conectado
    ) {
      const valor = anguloPendente;
      anguloPendente = null;

      const dados = new TextEncoder().encode(
        Math.round(valor) + "\n"
      );

      await escritorSerial.write(dados);
    }
  } catch (erro) {
    console.error("Falha ao enviar ângulo:", erro);
    statusArduino.textContent =
      "Falha na comunicação serial. Verifique o cabo.";
  } finally {
    enviando = false;
  }
}

function enviarAngulo(angulo) {
  if (!escritorSerial || !conectado) return;

  const agora = Date.now();
  const valor = Math.round(
    Math.max(ANGULO_MIN, Math.min(ANGULO_MAX, angulo))
  );

  if (
    ultimoAnguloEnviado !== null &&
    Math.abs(valor - ultimoAnguloEnviado) < VARIACAO_MINIMA
  ) {
    return;
  }

  if (agora - ultimoEnvio < INTERVALO_ENVIO) return;

  ultimoAnguloEnviado = valor;
  ultimoEnvio = agora;
  anguloPendente = valor;

  processarFilaSerial();
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
    ultimoAnguloEnviado = null;

    statusArduino.textContent = "Arduino conectado a 9600 baud.";
  } catch (erro) {
    console.error("Erro ao conectar:", erro);

    statusArduino.textContent =
      "Não foi possível conectar: " + erro.message;

    conectado = false;
  } finally {
    atualizarBotoes();
  }
});

botaoDesconectar.addEventListener("click", async () => {
  conectado = false;
  anguloPendente = null;

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
    console.error("Erro ao desconectar:", erro);
    statusArduino.textContent =
      "Erro ao desconectar. Verifique a conexão USB.";
  } finally {
    atualizarBotoes();
  }
});

document.getElementById("teste30").addEventListener(
  "click", () => enviarAngulo(30)
);

document.getElementById("teste90").addEventListener(
  "click", () => enviarAngulo(90)
);

document.getElementById("teste150").addEventListener(
  "click", () => enviarAngulo(150)
);

function aoDetectar(resultado) {
  const largura = video.videoWidth;
  const altura = video.videoHeight;

  if (!largura || !altura) return;

  // Mantém as coordenadas do canvas iguais às do vídeo original.
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

  const flexao = calcularAngulo(mao[5], mao[6], mao[8]);
  const anguloServo = mapearParaServo(flexao);

  flexaoTexto.textContent = Math.round(flexao) + "°";
  anguloTexto.textContent = anguloServo + "°";

  status.textContent = conectado
    ? "Mão detectada — controle ativo."
    : "Mão detectada — conecte o Arduino.";

  if (conectado) {
    enviarAngulo(anguloServo);
  }
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
        "Câmera indisponível. Abra a página em um contexto HTTPS seguro."
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
    console.error("Erro na câmera:", erro);
    status.textContent = "Erro ao iniciar câmera: " + erro.message;
    placeholder.textContent = "Não foi possível iniciar a câmera.";
  }
}

atualizarBotoes();
iniciarCamera();
