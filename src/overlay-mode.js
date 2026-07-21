// ============================================================
// 透明窗口叠放模式 (Overlay via BrowserWindow)
//
// 用 Electron 的 BrowserWindow 创建一个无边框子窗口，
// 然后通过 getNativeWindowHandle() 拿到子窗口的句柄，
// 用挖孔技术（embedView）在子窗口中嵌入 Metal 渲染。
//
// 本质 = BrowserWindow 子窗口 + 挖孔
//
// 优点: 窗口管理在 JS 层，子窗口可叠加 web UI
// 缺点: 独立窗口，缩放时需手动同步位置
// ============================================================

const { BrowserWindow } = require('electron');

let childWin = null;

function start(parentWin, addon, screenRect) {
  stop(addon);

  childWin = new BrowserWindow({
    parent: parentWin,
    x: Math.round(screenRect.x),
    y: Math.round(screenRect.y),
    width: Math.round(screenRect.width),
    height: Math.round(screenRect.height),
    frame: false,
    transparent: false,
    hasShadow: false,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false },
  });

  childWin.once('ready-to-show', () => {
    childWin.showInactive();

    // 用挖孔技术在子窗口中嵌入 Metal 渲染
    const handle = childWin.getNativeWindowHandle();
    const bounds = childWin.getContentBounds();
    addon.embedView(handle, 0, 0, bounds.width, bounds.height);
  });

  // 加载一个空白页，不需要任何 web 内容
  childWin.loadURL('about:blank');
}

function stop(addon) {
  addon.removeEmbed();
  if (childWin && !childWin.isDestroyed()) {
    childWin.close();
  }
  childWin = null;
}

function updatePosition(parentWin, addon, screenRect) {
  if (!childWin || childWin.isDestroyed()) return;

  childWin.setBounds({
    x: Math.round(screenRect.x),
    y: Math.round(screenRect.y),
    width: Math.round(screenRect.width),
    height: Math.round(screenRect.height),
  });

  // 重新定位挖孔视图（子窗口内部坐标从 0,0 开始）
  const handle = childWin.getNativeWindowHandle();
  const bounds = childWin.getContentBounds();
  addon.updateEmbedFrame(handle, 0, 0, bounds.width, bounds.height);
}

module.exports = { start, stop, updatePosition };
