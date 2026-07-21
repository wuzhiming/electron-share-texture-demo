const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fpsEl = document.getElementById('fps');
const modeLabel = document.getElementById('mode-label');
const btnShared = document.getElementById('btn-shared');
const btnEmbed = document.getElementById('btn-embed');
const btnOverlay = document.getElementById('btn-overlay');

let lastTime = performance.now();
let frameCount = 0;
let currentMode = 'shared-texture';

const MODE_LABELS = {
  'shared-texture': 'Metal &rarr; IOSurface &rarr; sharedTexture &rarr; Canvas',
  'embed':          'Metal &rarr; CAMetalLayer &rarr; NSView 挖孔 (Direct)',
  'overlay':        'Metal &rarr; 透明窗口叠放 (Overlay)',
};

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

// Mouse events (sharedTexture / overlay mode — embed mode handles natively)
function sendEvent(type, e) {
  if (currentMode === 'embed') return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  window.nativeTexture.sendInput(type, x, y, e.button);
}

canvas.addEventListener('mousemove', (e) => sendEvent('mousemove', e));
canvas.addEventListener('mousedown', (e) => sendEvent('mousedown', e));
canvas.addEventListener('mouseup', (e) => sendEvent('mouseup', e));
canvas.addEventListener('mouseleave', (e) => sendEvent('mouseleave', e));

// Report canvas rect (embed/overlay positioning) — CSS pixels, no DPR scaling
function reportCanvasRect() {
  const rect = canvas.getBoundingClientRect();
  window.nativeTexture.reportCanvasRect({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

window.nativeTexture.onGetCanvasRect(() => {
  reportCanvasRect();
});

// 监听 canvas 区域布局变化（窗口缩放、DevTools 打开/关闭等）
const canvasWrap = document.getElementById('canvas-wrap');
new ResizeObserver(() => {
  if (currentMode === 'embed' || currentMode === 'overlay') {
    const rect = canvas.getBoundingClientRect();
    window.nativeTexture.sendCanvasRectUpdate({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }
}).observe(canvasWrap);

// Mode toggle
function setMode(mode) {
  currentMode = mode;
  btnShared.classList.toggle('active', mode === 'shared-texture');
  btnEmbed.classList.toggle('active', mode === 'embed');
  btnOverlay.classList.toggle('active', mode === 'overlay');

  modeLabel.innerHTML = MODE_LABELS[mode];

  if (mode === 'shared-texture') {
    canvas.style.visibility = 'visible';
  } else {
    // embed 和 overlay 都隐藏 canvas（原生视图覆盖在上面或嵌入在里面）
    canvas.style.visibility = 'hidden';
  }

  window.nativeTexture.setMode(mode);
}

btnShared.addEventListener('click', () => setMode('shared-texture'));
btnEmbed.addEventListener('click', () => setMode('embed'));
btnOverlay.addEventListener('click', () => setMode('overlay'));
