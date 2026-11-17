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
let stopped = false;
let cleanupPromise;

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  stopped = true;
  clearTimeout(animationTimer);
  cleanupPromise = sharedTextureMode.whenIdle().then(() => {
    if (addon) {
      addon.destroy();
      addon = null;
    }
  });
  return cleanupPromise;
}

app.whenReady().then(() => {
  const width = 512;
  const height = 512;

  win = new BrowserWindow({
    width: width + 50,
    height: height + 166,
    transparent: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } }
      : {}),
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  addon = require('../build/Release/native_renderer.node');
  addon.init(width, height);
  let nativeWindowInteraction = false;
  let lastNativeInteraction = -Infinity;
  if (process.platform === 'win32') {
    // The native move/resize loop can defer Electron's frame-transfer callbacks.
    win.hookWindowMessage(0x0231, () => { // WM_ENTERSIZEMOVE
      nativeWindowInteraction = true;
    });
    win.hookWindowMessage(0x0232, () => { // WM_EXITSIZEMOVE
      nativeWindowInteraction = false;
      lastNativeInteraction = performance.now();
    });
  }

  const updateMenuDrag = () => {
    if (process.platform === 'win32' && addon && win && !win.isDestroyed()) {
      addon.configureMenuBarDrag(win.getNativeWindowHandle());
    }
  };

  ipcMain.on('begin-window-drag', (event) => {
    if (process.platform === 'win32' && addon && win && !win.isDestroyed() && event.sender === win.webContents) {
      addon.beginWindowDrag(win.getNativeWindowHandle());
    }
  });

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
  let waitingForModeRect = false;

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
    if (!['shared-texture', 'embed', 'overlay', 'underlay'].includes(mode)) return;
    stopCurrentMode();
    currentMode = mode;

    waitingForModeRect = mode !== 'shared-texture';
    if (waitingForModeRect) {
      e.sender.send('get-canvas-rect');
    }
  });

  function updateCanvasRect(e, rect) {
    if (!rect || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rect[key])) || rect.width <= 0 || rect.height <= 0) return;
    lastCanvasRect = rect;
    if (waitingForModeRect) {
      waitingForModeRect = false;
      startMode(currentMode, rect);
      return;
    }
    const screenRect = getCanvasScreenRect(rect);
    if (currentMode === 'embed') {
      embedMode.updateRect(win, addon, rect);
    } else if (currentMode === 'overlay') {
      overlayMode.updatePosition(win, addon, screenRect);
    } else if (currentMode === 'underlay') {
      underlayMode.updatePosition(win, addon, screenRect);
    }
  }
  ipcMain.on('canvas-rect', updateCanvasRect);
  ipcMain.on('canvas-rect-update', updateCanvasRect);

  const requestFreshRect = () => {
    if (win && !win.isDestroyed() && currentMode !== 'shared-texture') {
      win.webContents.send('get-canvas-rect');
    }
  };

  // ── Render loop ──

  let frameCount = 0;
  let renderInProgress = false;

  const renderLoop = async () => {
    if (stopped || !win || win.isDestroyed() || renderInProgress) return;
    if (nativeWindowInteraction) {
      animationTimer = setTimeout(renderLoop, 16);
      return;
    }
    renderInProgress = true;

    try {
      const time = frameCount * 0.016;
      const result = addon.render(time);
      frameCount++;

      if (currentMode === 'shared-texture') {
        await sharedTextureMode.sendFrame(win, addon, sharedTexture, result);
      }
    } catch (error) {
      const interruptedTransfer = error.message?.includes('transfer shared texture timed out') &&
        (nativeWindowInteraction || performance.now() - lastNativeInteraction < 1500);
      if (!interruptedTransfer) {
        console.error('Render failed:', error);
        if (win && !win.isDestroyed()) win.webContents.send('render-error', error.message);
        return;
      }
      // sendFrame has already drained the GPU references; resume with a fresh frame.
      console.warn('Skipped a shared-texture frame during native window movement.');
    } finally {
      renderInProgress = false;
    }

    if (!stopped) animationTimer = setTimeout(renderLoop, 16);
  };

  win.webContents.on('did-finish-load', () => {
    updateMenuDrag();
    animationTimer = setTimeout(renderLoop, 200);
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
  win.on('resize', updateMenuDrag);
  win.webContents.on('devtools-opened', requestFreshRect);
  win.webContents.on('devtools-closed', requestFreshRect);

  win.on('closed', () => {
    if (animationTimer) clearTimeout(animationTimer);
    stopCurrentMode();
    ipcMain.removeAllListeners('input');
    ipcMain.removeAllListeners('begin-window-drag');
    ipcMain.removeAllListeners('set-mode');
    ipcMain.removeAllListeners('canvas-rect');
    ipcMain.removeAllListeners('canvas-rect-update');
    cleanup();
    win = null;
  });
}).catch((error) => {
  console.error('Initialization failed:', error);
  cleanup().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  cleanup().finally(() => app.quit());
});

app.on('before-quit', (event) => {
  if (addon) {
    event.preventDefault();
    if (win && !win.isDestroyed()) win.destroy();
    cleanup().finally(() => app.quit());
  }
});
