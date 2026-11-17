const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(require('electron'), ['.', ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
}
process.exit(result.status ?? 1);
