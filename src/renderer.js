const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fpsEl = document.getElementById('fps');
const modeLabel = document.getElementById('mode-label');
const btnShared = document.getElementById('btn-shared');
const btnEmbed = document.getElementById('btn-embed');
const btnOverlay = document.getElementById('btn-overlay');
const btnUnderlay = document.getElementById('btn-underlay');

let lastTime = performance.now();
let frameCount = 0;
let currentMode = 'shared-texture';

const MODE_LABELS = {
  'shared-texture': 'Metal &rarr; IOSurface &rarr; sharedTexture &rarr; Canvas',
  'embed':          'Metal &rarr; CAMetalLayer &rarr; NSView 挖孔 (Direct)',
  'overlay':        'Metal &rarr; BrowserWindow(前) + 挖孔',
  'underlay':       'Metal &rarr; BrowserWindow(后) + 透明穿透',
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

// Mouse events (embed 模式由 NSView 原生处理，其他模式走 IPC)
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

// Report canvas rect — CSS pixels, no DPR scaling
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

const canvasWrap = document.getElementById('canvas-wrap');
new ResizeObserver(() => {
  if (currentMode !== 'shared-texture') {
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
const ALL_BUTTONS = { 'shared-texture': btnShared, 'embed': btnEmbed, 'overlay': btnOverlay, 'underlay': btnUnderlay };

function setMode(mode) {
  currentMode = mode;
  for (const [m, btn] of Object.entries(ALL_BUTTONS)) {
    btn.classList.toggle('active', m === mode);
  }

  modeLabel.innerHTML = MODE_LABELS[mode];
  document.body.classList.toggle('underlay-mode', mode === 'underlay');

  if (mode === 'shared-texture') {
    canvas.style.visibility = 'visible';
  } else if (mode === 'underlay') {
    // underlay: canvas 透明可见，渲染从后面穿透过来
    canvas.style.visibility = 'visible';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    // embed / overlay: canvas 隐藏，原生视图覆盖
    canvas.style.visibility = 'hidden';
  }

  window.nativeTexture.setMode(mode);
}

btnShared.addEventListener('click', () => setMode('shared-texture'));
btnEmbed.addEventListener('click', () => setMode('embed'));
btnOverlay.addEventListener('click', () => setMode('overlay'));
btnUnderlay.addEventListener('click', () => setMode('underlay'));
