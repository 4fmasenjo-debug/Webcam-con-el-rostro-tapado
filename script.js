const video = document.getElementById("video");
let fondo = new Image(); 
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            console.log(`Imagen cargada con éxito: ${src}`);
            resolve(img);
        };
        img.onerror = (e) => {
            console.error(`ERROR: Fallo al cargar la imagen: ${src}`, e);
            reject(new Error(`Fallo al cargar la imagen: ${src}`));
        };
        img.src = src;
    });
}

// --- Lógica principal de carga y configuración ---
Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models")
        .then(() => console.log("tinyFaceDetector cargado.")),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models")
        .then(() => console.log("faceLandmark68Net cargado.")), 
    loadImage('fondo.png'), // <<< Imagen del proyecto
]).then(async (results) => {
    console.log("Todos los recursos principales cargados. Resultados:", results);
    fondo = results[2];

    // Iniciar la webcam
    startWebcam();
}).catch(err => {
  console.error("ERROR CRÍTICO: Ocurrió un error al cargar los recursos necesarios.", err);
  alert("Ocurrió un error al cargar los recursos necesarios. Por favor, revisa la CONSOLA del navegador para más detalles (presiona F12 y ve a la pestaña 'Console').");
});

function startWebcam() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => {
      console.log("Webcam iniciada correctamente.");
      video.srcObject = stream;
    })
    .catch(err => {
        console.error("ERROR: Fallo al acceder a la webcam:", err);
        alert("No se pudo acceder a la webcam. Asegúrate de tener una cámara conectada y de dar permiso.");
    });
}

video.addEventListener("play", () => {
  console.log("Video de la webcam reproduciéndose. Configurando canvas.");
  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.appendChild(canvas);
  faceapi.matchDimensions(canvas, { width: video.width, height: video.height });
  setInterval(async () => {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();
    const resized = faceapi.resizeResults(detections, { width: video.width, height: video.height });
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (resized.length === 0) {
        return;
    }

    resized.forEach(result => {
      const landmarks = result.landmarks;
      drawFaceDecorations(ctx, landmarks); 
    });
  }, 100); 
});

/**
 * Dibuja la imagen de fondo para cubrir y adaptarse a la forma de toda la cara (incluida la frente extendida).
 * Utiliza enmascaramiento con el contorno facial detectado.
 * @param {CanvasRenderingContext2D} ctx - El contexto de renderizado 2D del canvas.
 * @param {faceapi.FaceLandmarks68} landmarks - Los puntos de referencia faciales detectados.
 */
function drawFaceDecorations(ctx, landmarks) {
  if (!fondo.complete || fondo.naturalWidth === 0) {
      console.warn("Imagen de fondo no cargada o dimensiones inválidas.");
      return;
  }

  const jaw = landmarks.getJawOutline();
  const leftEyeBrow = landmarks.getLeftEyeBrow();
  const rightEyeBrow = landmarks.getRightEyeBrow();
  const eyebrowWidth = rightEyeBrow[4].x - leftEyeBrow[0].x;
  const faceEyebrowToChinHeight = jaw[8].y - Math.min(leftEyeBrow[2].y, rightEyeBrow[2].y);
  const foreheadExtensionFactor = 0.4;
  const foreheadTopY = Math.min(leftEyeBrow[2].y, rightEyeBrow[2].y) - faceEyebrowToChinHeight * foreheadExtensionFactor;
  const lateralExtensionFactor = 0.15;
  const foreheadLeftX = leftEyeBrow[0].x - eyebrowWidth * lateralExtensionFactor;
  const foreheadRightX = rightEyeBrow[4].x + eyebrowWidth * lateralExtensionFactor;
  const topLeftForehead = { x: foreheadLeftX, y: foreheadTopY };
  const topRightForehead = { x: foreheadRightX, y: foreheadTopY };
  const maskLeftX = Math.min(jaw[0].x, topLeftForehead.x);
  const maskRightX = Math.max(jaw[jaw.length - 1].x, topRightForehead.x);
  const maskTopY = topLeftForehead.y;
  const maskBottomY = jaw[8].y;
  const maskWidth = maskRightX - maskLeftX;
  const maskHeight = maskBottomY - maskTopY;
  const faceCenterX = maskLeftX + maskWidth / 2;
  const faceCenterY = maskTopY + maskHeight / 2;

  ctx.save(); 
  ctx.beginPath();
  ctx.moveTo(topLeftForehead.x, topLeftForehead.y);
  ctx.lineTo(topRightForehead.x, topRightForehead.y);
  ctx.lineTo(rightEyeBrow[4].x, rightEyeBrow[4].y);
  ctx.lineTo(jaw[jaw.length - 1].x, jaw[jaw.length - 1].y);
  for (let i = jaw.length - 2; i >= 0; i--) {
    ctx.lineTo(jaw[i].x, jaw[i].y);
  }
  ctx.lineTo(jaw[0].x, jaw[0].y); 
  ctx.lineTo(leftEyeBrow[0].x, leftEyeBrow[0].y); 
  ctx.closePath();
  ctx.fill(); 
  ctx.globalCompositeOperation = 'source-in';
  drawImageWithTransform(ctx, fondo, {
    translate: [faceCenterX, faceCenterY],
    scale: Math.max(maskWidth / fondo.naturalWidth, maskHeight / fondo.naturalHeight) * 1.05,
    rotate: 0, 
    offsetX: fondo.naturalWidth / 2, 
    offsetY: fondo.naturalHeight / 2
  });
  ctx.restore();
}

/**
 * Dibuja una imagen en el contexto del canvas con traslación, rotación y escalado.
 * Permite posicionar y transformar la imagen respecto a su propio centro.
 * @param {CanvasRenderingContext2D} ctx - El contexto de renderizado 2D.
 * @param {HTMLImageElement} image - La imagen a dibujar.
 * @param {object} transform - Objeto que contiene translate (array [x, y]), rotate (grados), scale (factor), offsetX (píxeles), offsetY (píxeles).
 */
function drawImageWithTransform(ctx, image, transform = {}) {
  const { translate = [0, 0], rotate = 0, scale = 1, offsetX = 0, offsetY = 0 } = transform;

  ctx.save();
  ctx.translate(translate[0], translate[1]); 
  ctx.rotate((rotate * Math.PI) / 180); 
  ctx.scale(scale, scale); 
  ctx.drawImage(image, -offsetX, -offsetY);
  ctx.restore();
}