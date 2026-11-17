const { sharedTexture } = require('electron');
const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('nativeTexture', {
  platform: process.platform,
  beginWindowDrag: () => ipcRenderer.send('begin-window-drag'),
  onFrame: (callback) => {
    sharedTexture.setSharedTextureReceiver(async (data) => {
      const { importedSharedTexture: imported } = data;
      let videoFrame;
      try {
        videoFrame = imported.getVideoFrame();
        callback(videoFrame);
      } finally {
        videoFrame?.close();
        imported.release();
      }
    });
  },
  sendInput: (type, x, y, button) => {
    ipcRenderer.send('input', { type, x, y, button });
  },
  setMode: (mode) => {
    ipcRenderer.send('set-mode', mode);
  },
  reportCanvasRect: (rect) => {
    ipcRenderer.send('canvas-rect', rect);
  },
  onGetCanvasRect: (callback) => {
    ipcRenderer.on('get-canvas-rect', () => callback());
  },
  sendCanvasRectUpdate: (rect) => {
    ipcRenderer.send('canvas-rect-update', rect);
  },
  onError: (callback) => {
    ipcRenderer.on('render-error', (_event, message) => callback(message));
  },
});
