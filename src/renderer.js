const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fpsEl = document.getElementById('fps');
const modeLabel = document.getElementById('mode-label');
const btnShared = document.getElementById('btn-shared');
const btnEmbed = document.getElementById('btn-embed');

let lastTime = performance.now();
let frameCount = 0;
let currentMode = 'shared-texture';

// sharedTexture frame receiver
window.nativeTexture.onFrame((videoFrame) => {
  if (currentMode !== 'shared-texture') return;
  canvas.width = videoFrame.displayWidth;
  canvas.height = videoFrame.displayHeight;
  ctx.drawImage(videoFrame, 0, 0);

  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fpsEl.textContent = `${frameCount} fps`;
    frameCount = 0;
    lastTime = now;
  }
});

// Mouse events (sharedTexture mode — embed mode handles natively)
function sendEvent(type, e) {
  if (currentMode !== 'shared-texture') return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  window.nativeTexture.sendInput(type, x, y, e.button);
}

canvas.addEventListener('mousemove', (e) => sendEvent('mousemove', e));
canvas.addEventListener('mousedown', (e) => sendEvent('mousedown', e));
canvas.addEventListener('mouseup', (e) => sendEvent('mouseup', e));
canvas.addEventListener('mouseleave', (e) => sendEvent('mouseleave', e));

// Report canvas rect for embed positioning
function reportCanvasRect() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  window.nativeTexture.reportCanvasRect({
    x: rect.x * dpr,
    y: rect.y * dpr,
    width: rect.width * dpr,
    height: rect.height * dpr,
  });
}

// Listen for rect request from main process
window.nativeTexture.onGetCanvasRect(() => {
  reportCanvasRect();
});

// Report on resize
window.addEventListener('resize', () => {
  if (currentMode === 'embed') {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    window.nativeTexture.sendCanvasRectUpdate({
      x: rect.x * dpr,
      y: rect.y * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr,
    });
  }
});

// Mode toggle
function setMode(mode) {
  currentMode = mode;
  btnShared.classList.toggle('active', mode === 'shared-texture');
  btnEmbed.classList.toggle('active', mode === 'embed');

  if (mode === 'shared-texture') {
    modeLabel.innerHTML = 'Metal &rarr; IOSurface &rarr; sharedTexture &rarr; Canvas';
    canvas.style.visibility = 'visible';
  } else {
    modeLabel.innerHTML = 'Metal &rarr; CAMetalLayer &rarr; NSView 挖孔 (Direct)';
    canvas.style.visibility = 'hidden';
  }

  window.nativeTexture.setMode(mode);
}

btnShared.addEventListener('click', () => setMode('shared-texture'));
btnEmbed.addEventListener('click', () => setMode('embed'));
