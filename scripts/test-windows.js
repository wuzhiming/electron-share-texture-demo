const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'win32') {
  console.error('This GPU integration check requires Windows.');
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), [path.join(__dirname, '../test/windows-smoke.cjs')], {
  cwd: path.join(__dirname, '..'), env, stdio: 'inherit', timeout: 30000,
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
