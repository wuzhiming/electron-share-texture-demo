const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync(process.execPath, [
  require.resolve('node-gyp/bin/node-gyp.js'),
  'rebuild',
  `--target=${require('electron/package.json').version}`,
  `--arch=${process.arch}`,
  '--dist-url=https://electronjs.org/headers',
  ...process.argv.slice(2),
], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
}
process.exit(result.status ?? 1);
