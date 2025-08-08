const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

let earringImg = null, necklaceImg = null;
let earringSrc = '', necklaceSrc = '';
let smoothedLandmarks = null;
let lastSnapshotDataURL = '';
let lastStableLandmarks = null;

// Stronger smoothing
const SMOOTHING_FACTOR = 0.9;

// ✅ Direct link to your Google Drive JSON file
const jsonURL = "https://drive.google.com/uc?id=1Wtz5WOMmP4bfqJWU5HAeF5XZBxnNZlue";

// Load image from URL
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

function changeEarring(src) {
  earringSrc = src;
  loadImage(earringSrc).then(img => { if (img) earringImg = img; });
}

function changeNecklace(src) {
  necklaceSrc = src;
  loadImage(necklaceSrc).then(img => { if (img) necklaceImg = img; });
}

function toggleCategory(category) {
  document.getElementById('subcategory-buttons').style.display = 'flex';
  const subButtons = document.querySelectorAll('#subcategory-buttons button');
  subButtons.forEach(btn => {
    btn.style.display = btn.innerText.toLowerCase().includes(category) ? 'inline-block' : 'none';
  });
  document.getElementById('jewelry-options').style.display = 'none';
}

async function insertJewelryOptions(type, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<p>Loading...</p>';

  try {
    const res = await fetch(jsonURL);
    const data = await res.json();

    container.innerHTML = '';
    if (!data[type] || data[type].length === 0) {
      container.innerHTML = `<p>No designs available</p>`;
      return;
    }

    data[type].forEach(url => {
      const btn = document.createElement('button');
      const img = document.createElement('img');
      img.src = url;
      btn.appendChild(img);
      btn.onclick = () => {
        if (type.includes('earrings')) changeEarring(url);
        else changeNecklace(url);
      };
      container.appendChild(btn);
    });
  } catch (error) {
    console.error('Error loading jewelry data:', error);
    container.innerHTML = `<p>Error loading designs</p>`;
  }
}

function selectJewelryType(type) {
  document.getElementById('jewelry-options').style.display = 'flex';
  earringImg = null; necklaceImg = null;
  earringSrc = ''; necklaceSrc = '';
  insertJewelryOptions(type, 'jewelry-options');
}

// Mediapipe FaceMesh setup
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});
faceMesh.onResults((results) => {
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const newLandmarks = results.multiFaceLandmarks[0];

    if (!smoothedLandmarks) smoothedLandmarks = newLandmarks;
    else {
      smoothedLandmarks = smoothedLandmarks.map((prev, i) => ({
        x: prev.x * SMOOTHING_FACTOR + newLandmarks[i].x * (1 - SMOOTHING_FACTOR),
        y: prev.y * SMOOTHING_FACTOR + newLandmarks[i].y * (1 - SMOOTHING_FACTOR),
        z: prev.z * SMOOTHING_FACTOR + newLandmarks[i].z * (1 - SMOOTHING_FACTOR),
      }));
    }

    lastStableLandmarks = smoothedLandmarks;
  }

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (lastStableLandmarks) {
    drawJewelry(lastStableLandmarks, canvasCtx);
  }
});

const camera = new Camera(videoElement, {
  onFrame: async () => { await faceMesh.send({ image: videoElement }); },
  width: 1280, height: 720
});
videoElement.addEventListener('loadedmetadata', () => {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
});
camera.start();

// Draw earrings & necklaces
function drawJewelry(landmarks, ctx) {
  if (!landmarks) return;
  if ((earringSrc && !earringImg) || (necklaceSrc && !necklaceImg)) return;

  const earringScale = 0.07, necklaceScale = 0.18;
  const leftEar = { x: landmarks[132].x * canvasElement.width - 6, y: landmarks[132].y * canvasElement.height - 16 };
  const rightEar = { x: landmarks[361].x * canvasElement.width + 6, y: landmarks[361].y * canvasElement.height - 16 };
  const neck = { x: landmarks[152].x * canvasElement.width - 8, y: landmarks[152].y * canvasElement.height + 10 };

  if (earringImg) {
    const width = earringImg.width * earringScale;
    const height = earringImg.height * earringScale;
    ctx.drawImage(earringImg, leftEar.x - width / 2, leftEar.y, width, height);
    ctx.drawImage(earringImg, rightEar.x - width / 2, rightEar.y, width, height);
  }
  if (necklaceImg) {
    const width = necklaceImg.width * necklaceScale;
    const height = necklaceImg.height * necklaceScale;
    ctx.drawImage(necklaceImg, neck.x - width / 2, neck.y, width, height);
  }
}

// Snapshot functions
function takeSnapshot() {
  if (!lastStableLandmarks) { alert("Face not detected. Please try again."); return; }
  const snapshotCanvas = document.createElement('canvas');
  const ctx = snapshotCanvas.getContext('2d');
  snapshotCanvas.width = videoElement.videoWidth;
  snapshotCanvas.height = videoElement.videoHeight;
  ctx.drawImage(videoElement, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
  drawJewelry(lastStableLandmarks, ctx);
  lastSnapshotDataURL = snapshotCanvas.toDataURL('image/png');
  document.getElementById('snapshot-preview').src = lastSnapshotDataURL;
  document.getElementById('snapshot-modal').style.display = 'block';
}

function saveSnapshot() {
  const link = document.createElement('a');
  link.href = lastSnapshotDataURL;
  link.download = `jewelry-tryon-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function shareSnapshot() {
  if (navigator.share) {
    fetch(lastSnapshotDataURL)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], 'jewelry-tryon.png', { type: 'image/png' });
        navigator.share({ title: 'Jewelry Try-On', text: 'Check out my look!', files: [file] });
      })
      .catch(console.error);
  } else {
    alert('Sharing not supported on this browser.');
  }
}

function closeSnapshotModal() { document.getElementById('snapshot-modal').style.display = 'none'; }
function toggleInfoModal() {
  const modal = document.getElementById('info-modal');
  modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}
