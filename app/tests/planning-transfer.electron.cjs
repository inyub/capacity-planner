const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')
const year = new Date().getFullYear()
const card = {
  id: 'original',
  year,
  month: 0,
  order: 3,
  label: 'Kundin',
  title: 'Original',
  description: 'Erste Zeile\nZweite Zeile',
  minutesMin: 90,
  minutesMax: 1440,
  timeUnit: 'm',
  revenueMin: 150.5,
  revenueMax: 300,
  currency: 'CHF',
  expanded: false
}
const planning = (cards) => ({
  format: 'capacity-planner-planning',
  formatVersion: 1,
  dataVersion: 2,
  cards
})
const imported = [
  { ...card, id: 'future', year: year + 1, month: 11, order: 8, timeUnit: 'd' },
  { ...card, id: 'current', order: 6, timeUnit: 'h', expanded: true }
]

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'transfer-profile-'))
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ version: 2, cards: [card] }))
  fs.writeFileSync(path.join(profile, 'data.backup.json'), 'KEEP BACKUP')
  fs.writeFileSync(path.join(profile, 'new.json'), JSON.stringify(planning(imported)))
  const legacy = { ...card, id: 'legacy-import', hoursMin: 0.075, hoursMax: 24 }
  delete legacy.minutesMin
  delete legacy.minutesMax
  delete legacy.timeUnit
  fs.writeFileSync(
    path.join(profile, 'old.json'),
    JSON.stringify({ ...planning([legacy]), dataVersion: 1 })
  )
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    for (const phase of ['initial', 'restart']) {
      const result = spawnSync(require('electron'), [__filename, profile, phase], {
        env,
        encoding: 'utf8',
        timeout: 90000,
        windowsHide: true
      })
      console.log(result.stdout)
      if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    }
    console.log(
      'PASS: planning transfer IPC, preview, confirmation, cancellation, validation, errors, backup and restart'
    )
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('transfer-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app, dialog } = require('electron')
  const profile = process.argv[2],
    phase = process.argv[3]
  app.setPath('userData', profile)
  let openResult = null,
    saveResult = null
  dialog.showOpenDialog = async (win, options) => {
    assert.equal(win.webContents.getLastWebPreferences().sandbox, true)
    assert.deepEqual(options.properties, ['openFile'])
    assert.deepEqual(options.filters[0].extensions, ['json'])
    return openResult
      ? { canceled: false, filePaths: [openResult] }
      : { canceled: true, filePaths: [] }
  }
  dialog.showSaveDialog = async (_win, options) => {
    assert.deepEqual(options.filters[0].extensions, ['json'])
    return { canceled: !saveResult, filePath: saveResult }
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
    const pause = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms))
    const waitFor = async (code) => {
      for (let i = 0; i < 180; i++) {
        if (await js(code)) return
        await pause()
      }
      throw new Error(`Timed out: ${code}`)
    }
    const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const snapshot = () =>
      ['data.json', 'data.backup.json'].map((name) =>
        fs.readFileSync(path.join(profile, name), 'utf8')
      )
    const data = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    const open = async () => {
      await click('.settings-open')
      await click('.settings-nav-item:nth-child(2)')
    }
    const preview = async (name) => {
      openResult = path.join(profile, name)
      await click('.planning-import')
      await waitFor('!!document.querySelector(".planning-preview")')
      await waitFor('!document.querySelector(".planning-cancel").disabled')
    }
    const confirm = async () => {
      await click('.planning-confirm-check')
      await click('.planning-confirm')
      await waitFor(
        '!document.querySelector(".planning-preview") && !document.querySelector(".planning-import").disabled'
      )
    }
    await waitFor('document.querySelector(".add-card")?.disabled === false')
    await pause(500)
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(profile, 'expected.json'), 'utf8'))
      assert.deepEqual(data(), expected)
      assert.deepEqual(await js('window.capacityPlanner.loadData()'), expected)
      assert.equal(await js('localStorage.getItem("capacity-planner:column-width")'), '180')
      assert.equal(await js('document.querySelector(".selected-year").textContent'), String(year))
      console.log(
        'PASS: imported IDs, order, units, fields, all years, theme and view restore in a new process'
      )
      win.close()
      return
    }
    // Persist theme, window and preferences before taking no-change snapshots.
    await click('.settings-open')
    await click('.settings-theme-edit')
    await waitFor('!!document.querySelector(".theme-dialog[open]")')
    await click('.theme-save')
    await waitFor('!document.querySelector(".theme-dialog")')
    await click('.settings-close')
    await js('localStorage.setItem("capacity-planner:column-width", "180")')
    const before = snapshot()
    await open()
    await click('.planning-import')
    await waitFor(
      'document.querySelector(".planning-data").textContent.includes("Import abgebrochen")'
    )
    assert.deepEqual(snapshot(), before)
    await click('.planning-export')
    await waitFor(
      'document.querySelector(".planning-data").textContent.includes("Export abgebrochen")'
    )
    assert.deepEqual(snapshot(), before)
    saveResult = path.join(profile, 'roundtrip.json')
    await click('.planning-export')
    await waitFor('document.querySelector(".planning-data").textContent.includes("exportiert.")')
    assert.deepEqual(JSON.parse(fs.readFileSync(saveResult, 'utf8')), planning([card]))
    assert.deepEqual(snapshot(), before)
    await preview('new.json')
    assert.equal(await js('document.activeElement.className'), 'theme-button planning-cancel')
    assert.equal(await js('document.querySelector(".planning-confirm").disabled'), true)
    assert.ok(
      (await js('document.querySelector(".planning-preview").textContent')).includes(
        String(year + 1)
      )
    )
    assert.deepEqual(snapshot(), before)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor('!document.querySelector(".planning-preview")')
    assert.equal(await js('document.querySelector(".settings-dialog").open'), true)
    assert.deepEqual(snapshot(), before)
    await preview('new.json')
    await click('.planning-cancel')
    assert.deepEqual(snapshot(), before)
    for (const bad of [
      '{bad',
      JSON.stringify({ ...planning(imported), dataVersion: 99 }),
      JSON.stringify(planning([card, card])),
      JSON.stringify(planning([{ ...card, timeUnit: 'w' }])),
      JSON.stringify(planning([{ ...card, month: 12 }])),
      JSON.stringify(planning([{ ...card, year: 0 }])),
      JSON.stringify(planning([{ ...card, currency: 'USD' }])),
      JSON.stringify(planning([{ ...card, minutesMin: -1 }]))
    ]) {
      fs.writeFileSync(path.join(profile, 'bad.json'), bad)
      openResult = path.join(profile, 'bad.json')
      await click('.planning-import')
      await waitFor(
        '!!document.querySelector(".planning-data [role=alert]") && !document.querySelector(".planning-import").disabled'
      )
      assert.deepEqual(snapshot(), before)
    }
    openResult = path.join(profile, 'missing.json')
    await click('.planning-import')
    await waitFor(
      '!!document.querySelector(".planning-data [role=alert]") && !document.querySelector(".planning-import").disabled'
    )
    assert.deepEqual(snapshot(), before)
    saveResult = profile // export rename fails on a directory
    await click('.planning-export')
    await waitFor(
      '!!document.querySelector(".planning-data [role=alert]") && !document.querySelector(".planning-import").disabled'
    )
    assert.deepEqual(snapshot(), before)
    saveResult = path.join(profile, 'data.backup.json')
    await click('.planning-export')
    await waitFor(
      '!!document.querySelector(".planning-data [role=alert]") && !document.querySelector(".planning-import").disabled'
    )
    assert.deepEqual(snapshot(), before)
    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    await preview('new.json')
    await confirm()
    assert.ok(await js('!!document.querySelector(".planning-data [role=alert]")'))
    assert.deepEqual(snapshot(), before)
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    await preview('old.json')
    assert.ok(
      (await js('document.querySelector(".planning-preview").textContent')).includes('Stundenwerte')
    )
    await confirm()
    assert.deepEqual(
      data().cards.map((c) => [c.minutesMin, c.minutesMax, c.timeUnit]),
      [[5, 1440, 'h']]
    )
    assert.equal(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8'), before[0])
    await preview('roundtrip.json')
    await confirm()
    assert.deepEqual(data().cards, [card])
    await preview('new.json')
    // Inspect the preview at Windows minimum size; it remains scrollable.
    win.setSize(960, 620)
    await pause(500)
    assert.equal(
      await js(
        'document.querySelector(".planning-preview").scrollWidth <= document.querySelector(".settings-content").clientWidth'
      ),
      true
    )
    fs.writeFileSync(
      path.join(output, 'planning-preview.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await confirm()
    assert.deepEqual(data().cards, imported)
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8')).cards,
      [card]
    )
    const beforeEmpty = snapshot()
    fs.writeFileSync(path.join(profile, 'empty.json'), JSON.stringify(planning([])))
    await preview('empty.json')
    assert.ok(
      (await js('document.querySelector(".planning-preview").textContent')).includes(
        'alle vorhandenen Karten entfernt'
      )
    )
    await click('.planning-cancel')
    assert.deepEqual(snapshot(), beforeEmpty)
    await preview('empty.json')
    await confirm()
    assert.deepEqual(data().cards, [])
    await preview('new.json')
    await confirm()
    await click('.settings-close')
    assert.equal(await js('document.querySelector(".selected-year").textContent'), String(year))
    fs.writeFileSync(path.join(profile, 'expected.json'), JSON.stringify(data()))
    console.log(
      'PASS: native dialog API boundaries, preview, explicit replacement, v1 hours, v2 multi-year round-trip, empty file, cancel, validation and failure preserve backups'
    )
    win.close()
  }
  require('../out/main/index.js')
}
