const { spawnSync } = require('node:child_process')
const path = require('node:path')
for (const name of [
  'cards',
  'forms',
  'persistence',
  'drag-drop',
  'theme-manager',
  'view-preferences',
  'time',
  'planning-transfer',
  'updates'
]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, `${name}.electron.cjs`)], {
    stdio: 'inherit',
    windowsHide: true
  })
  if (result.status !== 0) process.exit(result.status || 1)
}
