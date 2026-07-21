// ============================================================
// 挖孔模式 (NSView Embedding)
//
// 通过 getNativeWindowHandle() 拿到 Electron 窗口的 NSView*,
// 在其上 addSubview 一个带 CAMetalLayer 的原生视图，
// Metal 直接渲染到这个子视图，完全绕过 web 渲染管线。
//
// 优点: 零拷贝，无版本限制，原生事件处理
// 缺点: 浮在 DOM 之上，无法参与 CSS 布局和 z-index
// ============================================================

function start(win, addon, canvasRect) {
  const handle = win.getNativeWindowHandle();
  addon.embedView(handle, canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height);
}

function stop(addon) {
  addon.removeEmbed();
}

function updateRect(win, addon, canvasRect) {
  const handle = win.getNativeWindowHandle();
  addon.updateEmbedFrame(handle, canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height);
}

module.exports = { start, stop, updateRect };
