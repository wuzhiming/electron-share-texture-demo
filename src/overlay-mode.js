// ============================================================
// 透明窗口叠放模式 (Overlay)
//
// Electron 窗口设为 transparent，DOM 中对应区域背景透明。
// 一个无边框原生 Metal 窗口放在 Electron 窗口正后方，
// 透过透明区域显示渲染内容。
//
// 优点: 完全解耦，原生窗口独立管理
// 缺点: 移动/缩放时需要手动同步位置，可能有 1-2 帧延迟
// ============================================================

function start(win, addon, canvasScreenRect) {
  const handle = win.getNativeWindowHandle();
  addon.createOverlay(
    handle,
    canvasScreenRect.x,
    canvasScreenRect.y,
    canvasScreenRect.width,
    canvasScreenRect.height
  );
}

function stop(addon) {
  addon.destroyOverlay();
}

function updatePosition(win, addon, canvasScreenRect) {
  const handle = win.getNativeWindowHandle();
  addon.updateOverlay(
    handle,
    canvasScreenRect.x,
    canvasScreenRect.y,
    canvasScreenRect.width,
    canvasScreenRect.height
  );
}

module.exports = { start, stop, updatePosition };
