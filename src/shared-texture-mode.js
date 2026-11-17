// ============================================================
// sharedTexture 模式
//
// Metal / D3D11 → IOSurface / NT HANDLE → Electron importSharedTexture
// → sendSharedTexture 到 renderer → getVideoFrame → canvas.drawImage
//
// 优点: 零拷贝 GPU 传输，内容在 DOM canvas 中，支持 CSS 布局
// 要求: Electron >= 38
// ============================================================

let pending = Promise.resolve();

function sendFrame(win, addon, sharedTexture, renderResult) {
  const handle = process.platform === 'win32'
    ? { ntHandle: renderResult.textureHandle }
    : { ioSurface: renderResult.textureHandle };
  let resolveReleased;
  const released = new Promise((resolve) => { resolveReleased = resolve; });

  const imported = sharedTexture.importSharedTexture({
    textureInfo: {
      pixelFormat: 'bgra',
      codedSize: { width: renderResult.width, height: renderResult.height },
      handle,
    },
    allReferencesReleased: resolveReleased,
  });

  pending = (async () => {
    try {
      await sharedTexture.sendSharedTexture({
        frame: win.webContents.mainFrame,
        importedSharedTexture: imported,
      });
    } finally {
      imported.release();
      // Transfer completion alone does not mean the renderer's GPU is done.
      // The render loop must await this before writing the same native texture.
      await released;
    }
  })();
  return pending;
}

module.exports = { sendFrame, whenIdle: () => pending.catch(() => {}) };
