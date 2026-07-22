// ============================================================
// 透明穿透模式 (Underlay)
//
// 主 BrowserWindow 设为 transparent，canvas 区域 CSS 透明。
// 创建一个独立 BrowserWindow 放在主窗口后面，
// 用挖孔技术在该窗口中嵌入 Metal 渲染，
// 渲染内容从主窗口的透明区域穿透显示出来。
//
// 本质 = transparent 主窗口 + BrowserWindow(后) + 挖孔
//
// 优点: 可在渲染内容上方叠加 DOM 元素（HUD、按钮等）
// 缺点: 需要 transparent:true，层级脆弱（点击其他窗口可能打乱）
// ============================================================

const { BrowserWindow } = require('electron');

let childWin = null;

function start(parentWin, addon, screenRect) {
  stop(addon);

  childWin = new BrowserWindow({
    x: Math.round(screenRect.x),
    y: Math.round(screenRect.y),
    width: Math.round(screenRect.width),
    height: Math.round(screenRect.height),
    frame: false,
    hasShadow: false,
    resizable: false,
    focusable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false },
  });

  childWin.once('ready-to-show', () => {
    // showInactive: 显示但不抢焦点，自然排在主窗口后面
    childWin.showInactive();

    // 用挖孔技术在子窗口中嵌入 Metal 渲染
    const handle = childWin.getNativeWindowHandle();
    const bounds = childWin.getContentBounds();
    addon.embedView(handle, 0, 0, bounds.width, bounds.height);

    // 确保主窗口在前面
    parentWin.focus();
  });

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

  const handle = childWin.getNativeWindowHandle();
  const bounds = childWin.getContentBounds();
  addon.updateEmbedFrame(handle, 0, 0, bounds.width, bounds.height);
}

module.exports = { start, stop, updatePosition };
