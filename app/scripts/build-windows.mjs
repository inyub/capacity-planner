import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readReleaseTarget } from '../src/shared/update-target.ts'

const require = createRequire(import.meta.url)
if (process.argv.slice(2).some((arg) => arg !== '--dir'))
  throw new Error('Nur --dir ist erlaubt. Dieser Build veröffentlicht niemals Dateien.')
const target = readReleaseTarget(
  JSON.parse(readFileSync(new URL('../resources/release-target.json', import.meta.url), 'utf8'))
)
const args = [
  require.resolve('electron-builder/cli.js'),
  '--win',
  '--publish',
  'never',
  ...process.argv.slice(2)
]
if (target)
  args.push(`--config.publish.owner=${target.owner}`, `--config.publish.repo=${target.repo}`)
else console.log('Kein GitHub-Releaseziel: Platzhalter-Metadaten, Laufzeit-Updates deaktiviert.')
const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
