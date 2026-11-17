const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture(platform, send) {
  const context = { module: { exports: {} }, process: { platform } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/shared-texture-mode.js'), 'utf8'), context);
  let options;
  let releases = 0;
  const imported = { release: () => { releases++; } };
  const api = {
    importSharedTexture: (value) => { options = value; return imported; },
    sendSharedTexture: send || (() => Promise.resolve()),
  };
  return {
    mode: context.module.exports,
    api,
    frame: { textureHandle: Buffer.alloc(8), width: 64, height: 32 },
    win: { webContents: { mainFrame: {} } },
    get options() { return options; },
    get releases() { return releases; },
  };
}

for (const [platform, key] of [['win32', 'ntHandle'], ['darwin', 'ioSurface']]) {
  test(`${platform}: hold the source until all GPU references are released`, async () => {
    let finishTransfer;
    const f = fixture(platform, () => new Promise(resolve => { finishTransfer = resolve; }));
    let finished = false;
    const done = f.mode.sendFrame(f.win, {}, f.api, f.frame).then(() => { finished = true; });
    assert.equal(f.options.textureInfo.handle[key], f.frame.textureHandle);
    assert.equal(f.options.textureInfo.pixelFormat, 'bgra');
    assert.equal(f.releases, 0);
    finishTransfer();
    await new Promise(setImmediate);
    assert.equal(f.releases, 1);
    assert.equal(finished, false, 'transfer completion must not allow overwriting');
    f.options.allReferencesReleased();
    await done;
    await f.mode.whenIdle();
    assert.equal(finished, true);
  });
}

test('failed transfer releases the importer and drains before propagating the error', async () => {
  const f = fixture('win32', () => Promise.reject(new Error('renderer closed')));
  const done = f.mode.sendFrame(f.win, {}, f.api, f.frame);
  const rejected = assert.rejects(done, /renderer closed/);
  await new Promise(setImmediate);
  assert.equal(f.releases, 1);
  f.options.allReferencesReleased();
  await rejected;
  await f.mode.whenIdle();
});

test('failed import leaves no pending source reference', async () => {
  const f = fixture('win32');
  f.api.importSharedTexture = () => { throw new Error('invalid handle'); };
  assert.throws(() => f.mode.sendFrame(f.win, {}, f.api, f.frame), /invalid handle/);
  assert.equal(f.releases, 0);
  await f.mode.whenIdle();
});
