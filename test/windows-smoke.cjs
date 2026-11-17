// Run through npm run test:windows, inside Electron (not system Node).
const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, sharedTexture } = require('electron');
const addon = require('../build/Release/native_renderer.node');
const mode = require('../src/shared-texture-mode');
const embed = require('../src/embed-mode');
const overlay = require('../src/overlay-mode');
const underlay = require('../src/underlay-mode');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.setPath('userData', path.join(app.getPath('temp'), `shared-texture-smoke-${process.pid}`));
// Keep Electron alive while the last window closes and GPU references drain.
app.on('window-all-closed', () => {});

function expected(x, y, width, height, time) {
  const u = (x + 0.5) / width, v = (y + 0.5) / height;
  const wave = Math.sin(u * 20 + time * 3) * Math.sin(v * 20 + time * 2) * 0.15;
  return [
    Math.sin(u * 6.2832 * 2 + time * 2) * 0.5 + 0.5 + wave,
    Math.sin(v * 6.2832 * 2 + time * 2.5 + 2.094) * 0.5 + 0.5 + wave * 0.8,
    Math.sin((u + v) * 6.2832 * 1.5 + time * 1.8 + 4.189) * 0.5 + 0.5 + wave * 0.6,
  ].map(value => Math.round(Math.max(0, Math.min(1, value)) * 255)).concat(255);
}

app.whenReady().then(async () => {
  let win;
  let initialized = false;
  try {
    assert.throws(() => addon.render(0), /init/);
    assert.throws(() => addon.init(0, 32), /dimensions/);
    assert.throws(() => addon.embedView(Buffer.alloc(1), 0, 0, 32, 32), /handle buffer/);
    win = new BrowserWindow({
      width: 640, height: 760, show: false, transparent: true,
      webPreferences: { preload: path.join(__dirname, '../src/preload.js') },
    });
    await win.loadFile(path.join(__dirname, '../index.html'));
    assert.equal(win.isMenuBarVisible(), true, 'Windows keeps the default menu bar');
    addon.init(64, 64);
    initialized = true;
    const menuDrag = addon.configureMenuBarDrag(win.getNativeWindowHandle());
    assert.ok(menuDrag.x > 0 && menuDrag.width > 0 && menuDrag.height > 0,
      'native menu buttons must remain outside the draggable blank region');
    console.log('PASS: native menu blank region returns the Windows caption hit test');
    for (const time of [0, 0.5, 1.5]) {
      const frame = addon.render(time);
      assert.equal(frame.width, 64);
      assert.equal(frame.height, 64);
      assert.equal(frame.textureHandle.length, process.arch === 'ia32' ? 4 : 8);
      await mode.sendFrame(win, addon, sharedTexture, frame);
      const samples = await win.webContents.executeJavaScript(`(() => {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        return [[5,7],[31,12],[47,51]].map(([x,y]) => Array.from(ctx.getImageData(x,y,1,1).data));
      })()`);
      for (const [i, [x, y]] of [[5, 7], [31, 12], [47, 51]].entries()) {
        const reference = expected(x, y, 64, 64, time);
        assert.ok(samples[i].every((value, channel) => Math.abs(value - reference[channel]) <= 4),
          `BGRA / UV / animation mismatch at t=${time}, (${x},${y}): ${samples[i]} vs ${reference}`);
      }
    }
    console.log('PASS: D3D11 -> NT HANDLE -> Electron -> VideoFrame -> Canvas pixel verification');
    win.showInactive();
    const rect = { x: 20, y: 100, width: 128, height: 128 };
    embed.start(win, addon, rect);
    addon.sendInput('mousedown', 0.5, 0.5, 0);
    addon.render(2);
    embed.updateRect(win, addon, { ...rect, width: 192, height: 96 });
    addon.render(2.1);
    win.setMenuBarVisibility(false);
    await pause(50);
    const hiddenMenuDrag = addon.configureMenuBarDrag(win.getNativeWindowHandle());
    assert.equal(hiddenMenuDrag.height, 0, 'hidden menu must not leave a draggable area over the canvas');
    embed.updateRect(win, addon, rect);
    addon.render(2.1);
    win.setMenuBarVisibility(true);
    await pause(50);
    assert.ok(addon.configureMenuBarDrag(win.getNativeWindowHandle()).height > 0);
    embed.updateRect(win, addon, rect);
    addon.render(2.1);
    embed.stop(addon);
    for (const controller of [overlay, underlay]) {
      let embedded = false;
      const trackedAddon = {
        ...addon,
        embedView: (...args) => { addon.embedView(...args); embedded = true; },
      };
      const bounds = win.getContentBounds();
      controller.start(win, trackedAddon, { ...rect, x: bounds.x + 20, y: bounds.y + 100 });
      const deadline = Date.now() + 3000;
      while (!embedded && Date.now() < deadline) await pause(25);
      assert.equal(embedded, true, 'ready-to-show must create the native view');
      addon.render(2.2);
      controller.updatePosition(win, addon, { ...rect, x: bounds.x + 40, y: bounds.y + 120 });
      addon.render(2.3);
      controller.stop(addon);
      // Exercise delayed ready-to-show after an immediate mode switch.
      controller.start(win, addon, rect);
      controller.stop(addon);
      await pause(100);
    }
    addon.destroy();
    addon.destroy();
    addon.init(32, 16);
    assert.equal(addon.render(0).height, 16);
    console.log('PASS: native preview, HWND embed/resize, overlay, underlay, rapid close, destroy/reinitialize');
    // Closing the receiver during transfer must still release the source.
    const interrupted = mode.sendFrame(win, addon, sharedTexture, addon.render(0.1)).catch(() => {});
    win.destroy();
    await interrupted;
    await mode.whenIdle();
    console.log('PASS: receiver shutdown during an in-flight shared texture transfer');
  } finally {
    await mode.whenIdle();
    if (initialized) addon.destroy();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
  }
}).then(() => app.exit(0)).catch(error => {
  console.error(error);
  app.exit(1);
});
