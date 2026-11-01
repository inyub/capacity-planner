const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'step5-profile-'))
  const year = new Date().getFullYear()
  const card = (id, month, order, extra = {}) => ({
    id,
    year,
    month,
    order,
    label: 'Auftraggeber',
    title: id,
    description: 'Beschreibung',
    hoursMin: 10,
    hoursMax: 15,
    revenueMin: 150,
    revenueMax: 300,
    currency: 'EUR',
    expanded: false,
    ...extra
  })
  const cards = [
    card('A', 0, 0),
    card('B', 0, 1, { hoursMin: 20, hoursMax: 20, revenueMin: 50, revenueMax: 50 }),
    card('C', 0, 2, {
      hoursMin: 0.1,
      hoursMax: 0.1,
      revenueMin: 0.1,
      revenueMax: 0.1,
      currency: 'CHF'
    }),
    card('D', 0, 3, {
      hoursMin: 0.2,
      hoursMax: 0.2,
      revenueMin: 0.2,
      revenueMax: 0.2,
      currency: 'CHF'
    }),
    card('Null', 1, 0, { hoursMin: 0, hoursMax: 0, revenueMin: 0, revenueMax: 0, currency: 'CHF' }),
    card('Einzelwert', 2, 0, { hoursMin: 2, hoursMax: 2, revenueMin: 150.5, revenueMax: 150.5 }),
    card('Anderes Jahr', 0, 0, { year: year + 1, hoursMin: 900, hoursMax: 900 })
  ]
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ version: 1, cards }))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    for (const phase of ['initial', 'restart']) {
      const result = spawnSync(require('electron'), [__filename, profile, phase], {
        env,
        encoding: 'utf8',
        timeout: 60000,
        windowsHide: true
      })
      console.log(result.stdout)
      if (result.status !== 0) throw new Error(result.stderr || String(result.error))
      const persisted = JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
      assert.equal(persisted.cards.find((c) => c.id === 'A').title, 'Beim Schließen gespeichert')
      assert.equal(persisted.cards.find((c) => c.id === 'A').expanded, true)
      assert.deepEqual(
        persisted.window,
        JSON.parse(fs.readFileSync(path.join(profile, 'expected-window.json'), 'utf8'))
      )
    }
    assert.equal(fs.existsSync(path.join(profile, 'data.json.tmp')), false)
    console.log('PASS: step 5 Electron checks, close flush and window/data restore after restart')
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('step5-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app, screen } = require('electron')
  const profile = process.argv[2]
  const phase = process.argv[3]
  app.setPath('userData', profile)
  const pause = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms))
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
    const waitFor = async (code) => {
      for (let i = 0; i < 150; i++) {
        if (await js(code)) return
        await pause()
      }
      throw new Error(`Timed out: ${code}`)
    }
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await pause()
    }
    const fill = async (name, value) => {
      await js(`(() => {
        const el = document.querySelector('[name="${name}"]');
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      })()`)
      await pause(10)
    }
    const totals = () =>
      js(
        `[...document.querySelectorAll('.month-totals')].map(e => [e.children[0].textContent.trim(), [...e.querySelectorAll('.month-revenue span')].map(s => s.textContent)])`
      )
    const read = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    await waitFor(
      `document.querySelectorAll('[data-card-id]').length === ${phase === 'initial' ? 6 : 5}`
    )
    if (phase === 'restart') {
      const expected = JSON.parse(
        fs.readFileSync(path.join(profile, 'expected-window.json'), 'utf8')
      )
      assert.deepEqual(win.getBounds(), expected)
      const all = await totals()
      assert.deepEqual(all[0], ['0d 5h 18m – 0d 6h 18m', ['400,3 CHF']])
      assert.equal(
        await js(
          'document.querySelector("[data-card-id=A] .description-toggle").getAttribute("aria-expanded")'
        ),
        'true'
      )
      console.log('PASS: exact normal window bounds, totals and expanded state restored')
      await js('window.capacityPlanner.closeApp()')
      return
    }
    const initial = await totals()
    assert.deepEqual(initial[0], ['1d 6h 18m – 1d 11h 18m', ['0,3 CHF', '200-350 EUR']])
    assert.deepEqual(initial[1], ['0d 0h 0m', ['0 CHF']])
    assert.deepEqual(initial[2], ['0d 2h 0m', ['150,5 EUR']])
    assert.deepEqual(initial[3], ['–', ['–']])
    await click('[data-card-id=A] .card-settings')
    await fill('time', '5-6')
    await fill('revenue', '400')
    await fill('currency', 'CHF')
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    assert.deepEqual((await totals())[0], ['1d 1h 18m – 1d 2h 18m', ['400,3 CHF', '50 EUR']])
    await click('[data-card-id=B] .card-settings')
    await click('.delete-card')
    await click('.confirm-delete')
    await waitFor('!document.querySelector(".card-form")')
    assert.deepEqual((await totals())[0], ['0d 5h 18m – 0d 6h 18m', ['400,3 CHF']])
    await click('.month-column:nth-child(4) .add-card')
    await fill('label', 'Kundin')
    await fill('title', 'Temporär')
    await fill('time', '2')
    await fill('revenue', '5')
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    assert.deepEqual((await totals())[3], ['0d 2h 0m', ['5 EUR']])
    await click('.month-column:nth-child(4) .card-settings')
    await click('.delete-card')
    await click('.confirm-delete')
    await waitFor('!document.querySelector(".card-form")')
    assert.deepEqual((await totals())[3], ['–', ['–']])

    const before = read()
    await js(
      `window.testSaves = []; window.testBaseline = ${JSON.stringify(before)}; window.testSaves.push(window.capacityPlanner.saveData({ ...window.testBaseline, cards: window.testBaseline.cards.map(c => c.id === 'A' ? { ...c, title: 'Zwischenstand 1' } : c) }));`
    )
    await pause(60)
    await js(
      `window.testSaves.push(window.capacityPlanner.saveData({ ...window.testBaseline, cards: window.testBaseline.cards.map(c => c.id === 'A' ? { ...c, title: 'Zwischenstand 2' } : c) }));`
    )
    await pause(60)
    assert.equal(
      read().cards.find((c) => c.id === 'A').title,
      before.cards.find((c) => c.id === 'A').title
    )
    await js('Promise.all(window.testSaves)')
    assert.equal(read().cards.find((c) => c.id === 'A').title, 'Zwischenstand 2')
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8')),
      before
    )

    for (const change of [
      { month: 12 },
      { minutesMin: -1 },
      { minutesMin: 9, minutesMax: 3 },
      { revenueMax: NaN },
      { currency: 'USD' }
    ]) {
      assert.equal(
        await js(
          `(async () => { const data = await window.capacityPlanner.loadData(); data.cards[0] = { ...data.cards[0], ${Object.entries(
            change
          )
            .map(
              ([k, v]) =>
                `${k}: ${typeof v === 'number' && Number.isNaN(v) ? 'NaN' : JSON.stringify(v)}`
            )
            .join(
              ','
            )} }; try { await window.capacityPlanner.saveData(data); return false; } catch { return true; } })()`
        ),
        true
      )
    }

    const work = screen.getPrimaryDisplay().workArea
    win.setBounds({ x: work.x + 30, y: work.y + 35, width: 1000, height: 650 })
    await pause(400)
    const normal = win.getBounds()
    win.maximize()
    await pause(400)
    assert.deepEqual(read().window, normal)
    win.unmaximize()
    await pause(400)
    fs.writeFileSync(path.join(profile, 'expected-window.json'), JSON.stringify(win.getBounds()))
    // Reload renders the last saved IPC snapshot, then capture the final sums.
    win.reload()
    await waitFor('document.querySelectorAll("[data-card-id]").length === 5')
    await pause(100)
    fs.writeFileSync(
      path.join(output, 'totals-step5.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    const previous = read()
    await js(
      `(async () => { const data = await window.capacityPlanner.loadData(); data.cards = data.cards.map(c => c.id === 'A' ? { ...c, title: 'Beim Schließen gespeichert', expanded: true } : c); window.pendingCloseSave = window.capacityPlanner.saveData(data); })()`
    )
    await pause(40)
    assert.equal(
      read().cards.find((c) => c.id === 'A').title,
      previous.cards.find((c) => c.id === 'A').title
    )
    console.log(
      'PASS: live monthly sums, currencies/zero/empty, create/edit/delete, debounce, backup, validation, normal/maximized bounds'
    )
    win.close()
  }
  require('../out/main/index.js')
}
