// ============================================================
// sharedTexture 模式
//
// Metal 渲染到 IOSurface → Electron importSharedTexture
// → sendSharedTexture 到 renderer → getVideoFrame → canvas.drawImage
//
// 优点: 零拷贝 GPU 传输，内容在 DOM canvas 中，支持 CSS 布局
// 要求: Electron >= 38
// ============================================================

let sending = false;

function sendFrame(win, addon, sharedTexture, renderResult) {
  if (sending) return;

  const imported = sharedTexture.importSharedTexture({
    textureInfo: {
      pixelFormat: 'bgra',
      codedSize: { width: renderResult.width, height: renderResult.height },
      handle: {
        ioSurface: renderResult.ioSurfaceBuffer,
      },
    },
    allReferencesReleased: () => {},
  });

  sending = true;
  sharedTexture
    .sendSharedTexture({
      frame: win.webContents.mainFrame,
      importedSharedTexture: imported,
    })
    .then(() => {
      imported.release();
      sending = false;
    })
    .catch((err) => {
      console.error('sendSharedTexture failed:', err);
      imported.release();
      sending = false;
    });
}

module.exports = { sendFrame };
