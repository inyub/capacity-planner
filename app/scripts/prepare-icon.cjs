// Convert the supplied PNG to standard Windows ICO sizes without changing the artwork.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')

if (!process.versions.electron) {
  const output = path.join(root, 'out')
  fs.mkdirSync(output, { recursive: true })
  const profile = fs.mkdtempSync(path.join(output, 'icon-profile-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    const result = spawnSync(require('electron'), [__filename, profile], {
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000
    })
    if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    console.log(result.stdout.trim())
  } finally {
    if (path.dirname(profile) === output && path.basename(profile).startsWith('icon-profile-'))
      fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app, nativeImage } = require('electron')
  app.setPath('userData', process.argv[2])
  app.disableHardwareAcceleration()
  app
    .whenReady()
    .then(() => {
      const source = path.join(root, '../appicon.png')
      const original = nativeImage.createFromPath(source)
      if (original.isEmpty()) throw new Error('appicon.png konnte nicht gelesen werden.')
      const sizes = [16, 24, 32, 48, 64, 128, 256]
      const images = sizes.map((size) =>
        original.resize({ width: size, height: size, quality: 'best' }).toPNG()
      )
      const header = Buffer.alloc(6 + 16 * sizes.length)
      header.writeUInt16LE(1, 2)
      header.writeUInt16LE(sizes.length, 4)
      let offset = header.length
      sizes.forEach((size, index) => {
        const entry = 6 + index * 16
        header[entry] = size === 256 ? 0 : size
        header[entry + 1] = size === 256 ? 0 : size
        header.writeUInt16LE(1, entry + 4)
        header.writeUInt16LE(32, entry + 6)
        header.writeUInt32LE(images[index].length, entry + 8)
        header.writeUInt32LE(offset, entry + 12)
        offset += images[index].length
      })
      fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([header, ...images]))
      fs.copyFileSync(source, path.join(root, 'build/icon.png'))
      fs.copyFileSync(source, path.join(root, 'resources/icon.png'))
      console.log(
        `appicon.png übernommen: ${sizes.join(', ')} px, PNG für Fenster und ICO für Windows.`
      )
      app.exit(0)
    })
    .catch((error) => {
      console.error(error)
      app.exit(1)
    })
}
