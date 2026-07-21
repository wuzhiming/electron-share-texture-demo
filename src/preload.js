const { sharedTexture } = require('electron');
const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('nativeTexture', {
  onFrame: (callback) => {
    sharedTexture.setSharedTextureReceiver(async (data) => {
      const { importedSharedTexture: imported } = data;
      const videoFrame = imported.getVideoFrame();
      callback(videoFrame);
      videoFrame.close();
      imported.release();
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
  reportCanvasScreenRect: (rect) => {
    ipcRenderer.send('canvas-screen-rect', rect);
  },
});
