const { app, BrowserWindow, sharedTexture, ipcMain } = require('electron');
const path = require('path');
const sharedTextureMode = require('./shared-texture-mode');
const embedMode = require('./embed-mode');

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

  // ── Input forwarding (sharedTexture mode only) ──

  ipcMain.on('input', (e, data) => {
    if (currentMode === 'shared-texture') {
      addon.sendInput(data.type, data.x, data.y, data.button);
    }
  });

  // ── Mode switching ──

  ipcMain.on('set-mode', (e, mode) => {
    currentMode = mode;
    if (mode === 'embed') {
      e.sender.send('get-canvas-rect');
      ipcMain.once('canvas-rect', (e2, rect) => {
        embedMode.start(win, addon, rect);
      });
    } else {
      embedMode.stop(addon);
    }
  });

  ipcMain.on('canvas-rect-update', (e, rect) => {
    if (currentMode === 'embed') {
      embedMode.updateRect(win, addon, rect);
    }
  });

  // ── Render loop (always runs, drives all three render targets) ──

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
