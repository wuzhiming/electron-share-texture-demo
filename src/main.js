const { app, BrowserWindow, sharedTexture, ipcMain } = require('electron');
const path = require('path');
const sharedTextureMode = require('./shared-texture-mode');
const embedMode = require('./embed-mode');
const overlayMode = require('./overlay-mode');
const underlayMode = require('./underlay-mode');

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
    transparent: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  addon = require('../build/Release/native_renderer.node');
  addon.init(width, height);

  // ── Input forwarding (embed 模式由原生 NSView 处理，其他模式走 IPC) ──

  ipcMain.on('input', (e, data) => {
    if (currentMode !== 'embed') {
      addon.sendInput(data.type, data.x, data.y, data.button);
    }
  });

  // ── Canvas 屏幕坐标计算 ──

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

  function stopCurrentMode() {
    if (currentMode === 'embed') embedMode.stop(addon);
    if (currentMode === 'overlay') overlayMode.stop(addon);
    if (currentMode === 'underlay') underlayMode.stop(addon);
  }

  function startMode(mode, rect) {
    lastCanvasRect = rect;
    const screenRect = getCanvasScreenRect(rect);
    if (mode === 'embed') {
      embedMode.start(win, addon, rect);
    } else if (mode === 'overlay') {
      overlayMode.start(win, addon, screenRect);
    } else if (mode === 'underlay') {
      underlayMode.start(win, addon, screenRect);
    }
  }

  ipcMain.on('set-mode', (e, mode) => {
    stopCurrentMode();
    currentMode = mode;

    if (mode === 'embed' || mode === 'overlay' || mode === 'underlay') {
      e.sender.send('get-canvas-rect');
      ipcMain.once('canvas-rect', (e2, rect) => {
        startMode(mode, rect);
      });
    }
  });

  ipcMain.on('canvas-rect-update', (e, rect) => {
    lastCanvasRect = rect;
    const screenRect = getCanvasScreenRect(rect);
    if (currentMode === 'embed') {
      embedMode.updateRect(win, addon, rect);
    } else if (currentMode === 'overlay') {
      overlayMode.updatePosition(win, addon, screenRect);
    } else if (currentMode === 'underlay') {
      underlayMode.updatePosition(win, addon, screenRect);
    }
  });

  const requestFreshRect = () => {
    if (!win.isDestroyed() && currentMode !== 'shared-texture') {
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

  // underlay 的子窗口没有 parent 绑定，需要手动跟随移动
  const syncUnderlay = () => {
    if (currentMode === 'underlay' && lastCanvasRect) {
      const screenRect = getCanvasScreenRect(lastCanvasRect);
      underlayMode.updatePosition(win, addon, screenRect);
    }
  };

  win.on('move', syncUnderlay);
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
