const { app, BrowserWindow, sharedTexture, ipcMain } = require('electron');
const path = require('path');
const sharedTextureMode = require('./shared-texture-mode');
const embedMode = require('./embed-mode');
const overlayMode = require('./overlay-mode');

let win = null;
let addon = null;
let animationTimer = null;
let currentMode = 'shared-texture';

app.whenReady().then(() => {
  const width = 512;
  const height = 512;

  win = new BrowserWindow({
    width: width + 50,
    height: height + 150,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  addon = require('../build/Release/native_renderer.node');
  addon.init(width, height);

  // ── Input forwarding (sharedTexture / overlay mode) ──

  ipcMain.on('input', (e, data) => {
    if (currentMode !== 'embed') {
      addon.sendInput(data.type, data.x, data.y, data.button);
    }
  });

  // ── Canvas 屏幕坐标计算 ──
  // renderer 发过来的是 CSS 像素 (= macOS points)，不做 DPR 缩放
  function getCanvasScreenRect(cssRect) {
    const contentBounds = win.getContentBounds();
    return {
      x: contentBounds.x + cssRect.x,
      y: contentBounds.y + cssRect.y,
      width: cssRect.width,
      height: cssRect.height,
    };
  }

  // ── Mode switching ──

  let lastCanvasRect = null;

  ipcMain.on('set-mode', (e, mode) => {
    if (currentMode === 'embed') embedMode.stop(addon);
    if (currentMode === 'overlay') overlayMode.stop(addon);

    currentMode = mode;

    if (mode === 'embed' || mode === 'overlay') {
      e.sender.send('get-canvas-rect');
      ipcMain.once('canvas-rect', (e2, rect) => {
        lastCanvasRect = rect;
        if (mode === 'embed') {
          embedMode.start(win, addon, rect);
        } else {
          const screenRect = getCanvasScreenRect(rect);
          overlayMode.start(win, addon, screenRect);
        }
      });
    }
  });

  ipcMain.on('canvas-rect-update', (e, rect) => {
    lastCanvasRect = rect;
    if (currentMode === 'embed') {
      embedMode.updateRect(win, addon, rect);
    } else if (currentMode === 'overlay') {
      const screenRect = getCanvasScreenRect(rect);
      overlayMode.updatePosition(win, addon, screenRect);
    }
  });

  // overlay 窗口跟随：窗口移动时用缓存坐标重算屏幕位置
  const syncOverlay = () => {
    if (currentMode === 'overlay' && lastCanvasRect) {
      const screenRect = getCanvasScreenRect(lastCanvasRect);
      overlayMode.updatePosition(win, addon, screenRect);
    }
  };

  // 请求 renderer 上报最新 canvas 坐标（DevTools 等导致布局变化时）
  const requestFreshRect = () => {
    if (!win.isDestroyed() && (currentMode === 'embed' || currentMode === 'overlay')) {
      win.webContents.send('get-canvas-rect');
    }
  };

  // ── Render loop ──

  let frameCount = 0;

  const renderLoop = () => {
    if (win.isDestroyed()) return;

    const time = frameCount * 0.016;
    const result = addon.render(time);
    frameCount++;

    if (currentMode === 'shared-texture') {
      sharedTextureMode.sendFrame(win, addon, sharedTexture, result);
    }

    animationTimer = setTimeout(renderLoop, 16);
  };

  win.webContents.on('did-finish-load', () => {
    setTimeout(renderLoop, 200);
  });

  win.on('resize', requestFreshRect);
  win.webContents.on('devtools-opened', requestFreshRect);
  win.webContents.on('devtools-closed', requestFreshRect);

  win.on('closed', () => {
    if (animationTimer) clearTimeout(animationTimer);
    ipcMain.removeAllListeners('input');
    ipcMain.removeAllListeners('set-mode');
    ipcMain.removeAllListeners('canvas-rect');
    ipcMain.removeAllListeners('canvas-rect-update');
    if (addon) addon.destroy();
    win = null;
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
