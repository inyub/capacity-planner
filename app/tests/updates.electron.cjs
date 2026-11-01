const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(output, 'update-profile-'))
  const profile = path.join(root, 'capacity-planner')
  fs.mkdirSync(profile)
  fs.mkdirSync(path.join(root, 'resources'))
  fs.writeFileSync(
    path.join(root, 'resources/capacity-planner-installed'),
    'de.dkarsiko.capacityplanner'
  )
  const appearance = require('../src/shared/themes.ts').defaultThemeState()
  appearance.activeId = 'dracula'
  const card = {
    id: 'update-current',
    year: new Date().getFullYear(),
    month: 0,
    order: 7,
    label: 'Testkundin',
    title: 'Bestehende Planung',
    description: 'Erhalten\nZweite Zeile',
    minutesMin: 90,
    minutesMax: 1440,
    timeUnit: 'd',
    revenueMin: 150.5,
    revenueMax: 300,
    currency: 'CHF',
    expanded: false
  }
  fs.writeFileSync(
    path.join(profile, 'data.json'),
    JSON.stringify({
      version: 2,
      appearance,
      cards: [card, { ...card, id: 'update-next', year: card.year + 1, timeUnit: 'm' }]
    })
  )
  fs.writeFileSync(path.join(profile, 'data.backup.json'), 'KEEP BACKUP')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    for (const phase of ['disabled', 'flow']) {
      const result = spawnSync(require('electron'), [__filename, root, phase], {
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60000
      })
      console.log(result.stdout)
      if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    }
    console.log(
      'PASS: update UI/IPC with simulated NSIS backend; no network, real installer or user data used'
    )
  } finally {
    assert.equal(path.dirname(root), output)
    assert.ok(path.basename(root).startsWith('update-profile-'))
    fs.rmSync(root, { recursive: true, force: true })
  }
} else {
  const { app } = require('electron')
  const { EventEmitter } = require('node:events')
  const root = process.argv[2],
    phase = process.argv[3],
    profile = path.join(root, 'capacity-planner')
  app.setPath('appData', root)
  app.setPath('userData', profile)
  app.getVersion = () => require('../package.json').version
  Object.defineProperty(app, 'isPackaged', { value: true })
  Object.defineProperty(process, 'resourcesPath', { value: path.join(root, 'resources') })
  const promises = require('node:fs/promises')
  const originalRead = promises.readFile
  promises.readFile = async (file, ...args) => {
    if (String(file).endsWith('resources\\release-target.json') && phase === 'flow')
      return JSON.stringify({ owner: 'test-owner', repo: 'test-repository' })
    return originalRead(file, ...args)
  }
  const backends = []
  let checks = 0,
    installs = 0,
    mode = 'available',
    downloadMode = 'hold'
  class FakeNsisUpdater extends EventEmitter {
    constructor(target) {
      super()
      assert.equal(target.provider, 'github')
      backends.push(this)
    }
    async checkForUpdates() {
      checks++
      if (mode === 'offline') throw new Error('offline')
      return { isUpdateAvailable: mode === 'available', updateInfo: { version: '0.3.1' } }
    }
    async downloadUpdate(token) {
      this.emit('download-progress', { percent: 50, transferred: 524288, total: 1048576 })
      if (downloadMode === 'hold')
        await new Promise((_, reject) => token.onCancel(() => reject(new Error('cancelled'))))
      if (downloadMode === 'error') {
        this.emit('error', new Error('checksum'))
        throw new Error('checksum')
      }
      return [path.join(root, 'simulated-installer.exe')]
    }
    quitAndInstall(silent, restart) {
      assert.equal(silent, true)
      assert.equal(restart, true)
      installs++
    }
  }
  const realUpdater = require('electron-updater')
  require.cache[require.resolve('electron-updater')].exports = {
    NsisUpdater: FakeNsisUpdater,
    CancellationToken: realUpdater.CancellationToken
  }
  app.on('browser-window-created', (_, win) => {
    win.once('ready-to-show', () =>
      run(win).catch((error) => {
        console.error(error)
        app.exit(1)
      })
    )
  })
  async function run(win) {
    const js = (code) => win.webContents.executeJavaScript(code, true)
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const waitFor = async (code) => {
      for (let i = 0; i < 160; i++) {
        if (await js(code)) return
        await pause(40)
      }
      throw new Error(`Timed out: ${code}`)
    }
    const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const snapshot = () =>
      ['data.json', 'data.backup.json'].map((name) =>
        fs.readFileSync(path.join(profile, name), 'utf8')
      )
    const status = (value) =>
      waitFor(`(async()=> (await window.capacityPlanner.getUpdateState()).status === '${value}')()`)
    await waitFor('document.querySelector(".add-card")?.disabled === false')
    await pause(500)
    const backend = backends[0]
    await js(`(() => {const el=document.querySelector('#column-width');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'180');
      el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await waitFor('document.querySelector(".view-toolbar output").textContent === "180 px"')
    const preferences = await js('({...localStorage})')
    assert.equal(checks, 0)
    const before = snapshot()
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(3)')
    await waitFor('!!document.querySelector(".update-check")')
    if (phase === 'disabled') {
      await status('disabled')
      assert.equal(await js('document.querySelector(".update-check").disabled'), true)
      await js('window.capacityPlanner.checkForUpdates()')
      assert.equal(backend, undefined)
      assert.equal(checks, 0)
      assert.deepEqual(snapshot(), before)
      assert.deepEqual(await js('({...localStorage})'), preferences)
      fs.writeFileSync(
        path.join(output, 'updates-disabled.png'),
        (await win.webContents.capturePage()).toPNG()
      )
      console.log(
        'PASS: missing release target disables UI and direct IPC without network or file changes'
      )
      win.close()
      return
    }
    await status('idle')
    assert.equal(backend.autoDownload, false)
    assert.equal(backend.autoInstallOnAppQuit, false)
    assert.equal(backend.disableDifferentialDownload, true)
    assert.equal(backend.disableWebInstaller, true)
    assert.equal(backend.allowDowngrade, false)
    mode = 'current'
    await click('.update-check')
    await status('current')
    mode = 'offline'
    await click('.update-check')
    await status('error')
    mode = 'available'
    await click('.update-check')
    await status('available')
    await waitFor('!!document.querySelector(".update-download")')
    await click('.settings-close')
    await waitFor('!document.querySelector(".settings-dialog")')
    await click('[data-card-id="update-current"] .card-settings')
    await waitFor('!!document.querySelector(".card-form")')
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(3)')
    await waitFor('!!document.querySelector(".update-download")')
    await click('.update-download')
    assert.equal(await js('!!document.querySelector(".update-settings .form-error")'), true)
    assert.equal((await js('window.capacityPlanner.getUpdateState()')).status, 'available')
    await click('.settings-close')
    await waitFor('!document.querySelector(".settings-dialog")')
    await click('.form-close')
    await waitFor('!document.querySelector(".card-form")')
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(3)')
    await waitFor('!!document.querySelector(".update-download")')
    await click('.update-download')
    await status('downloading')
    await waitFor('document.querySelector("progress")?.value === 50')
    await pause(150)
    fs.writeFileSync(
      path.join(output, 'updates-download.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await click('.update-cancel')
    await status('available')
    assert.equal(installs, 0)
    assert.deepEqual(snapshot(), before)
    downloadMode = 'error'
    await click('.update-download')
    await status('error')
    assert.equal(installs, 0)
    assert.deepEqual(snapshot(), before)
    await click('.update-check')
    await status('available')
    // Fail a real pending persistence write before the simulated installer can run.
    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    const size = win.getSize()
    win.setSize(size[0] + 10, size[1])
    downloadMode = 'success'
    await click('.update-download')
    await status('downloaded')
    assert.equal(installs, 0)
    assert.deepEqual(snapshot(), before)
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    win.setSize(...size)
    await pause(500)
    await waitFor('!!document.querySelector(".update-install")')
    await click('.update-install')
    await status('installing')
    assert.equal(installs, 1)
    assert.deepEqual(snapshot(), before)
    assert.deepEqual(await js('({...localStorage})'), preferences)
    console.log(
      'PASS: explicit checks/current/offline, progress, cancel, checksum failure, persistence gate, retry and simulated restart request preserve data/backups'
    )
    win.close()
  }
  require('../out/main/index.js')
}
