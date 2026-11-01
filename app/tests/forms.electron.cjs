const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'step4-profile-'))
  const year = new Date().getFullYear()
  const card = (id, month, order, extra = {}) => ({
    id,
    year,
    month,
    order,
    label: 'Auftraggeber',
    title: id,
    description: 'Zeile 1\nZeile 2',
    hoursMin: 10,
    hoursMax: 15,
    revenueMin: 1000.5,
    revenueMax: 2000,
    currency: 'EUR',
    expanded: false,
    ...extra
  })
  const cards = [
    card('Später', 0, 7),
    card('Buchsatz', 0, 2),
    card('Messe', 1, 0),
    card('Anderes Jahr', 0, 0, { year: year + 1 })
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
    }
    console.log('PASS: step 4 integration and restart')
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('step4-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app } = require('electron')
  const profile = process.argv[2]
  const phase = process.argv[3]
  app.setPath('userData', profile)
  const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))
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
      for (let i = 0; i < 120; i++) {
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
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      })()`)
      await pause(15)
    }
    const key = async (key, modifiers = []) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers })
      await pause()
    }
    const saved = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    await waitFor(
      `document.querySelectorAll('[data-card-id]').length === ${phase === 'initial' ? 3 : 2}`
    )
    if (phase === 'restart') {
      assert.equal(saved().cards.length, 4)
      const edited = saved().cards.find((c) => c.id === 'Buchsatz')
      assert.equal(edited.title, 'Überarbeitet')
      assert.equal(edited.description, '')
      assert.equal(edited.expanded, false)
      const created = saved().cards.find((c) => c.title === 'Neuer Auftrag')
      assert.equal(created.currency, 'CHF')
      assert.equal(created.year, new Date().getFullYear() + 1)
      assert.equal(created.month, 2)
      console.log('PASS: created/edited/deleted cards restored correctly after restart')
      await js('window.capacityPlanner.closeApp()')
      return
    }
    await click('.add-card')
    await waitFor('!!document.querySelector(".card-form")')
    assert.equal(
      await js('document.querySelector(".month-column").querySelector(".add-card") === null'),
      true
    )
    assert.equal(await js('document.activeElement.name'), 'label')
    assert.equal(await js('document.querySelector(".save-card").disabled'), true)
    assert.deepEqual(
      await js('[...document.querySelector("[name=currency]").options].map(o => o.value)'),
      ['EUR', 'CHF']
    )
    await fill('label', 'Kundin')
    await fill('title', 'Neu')
    await fill('revenue', '150')
    for (const invalid of [
      '-1',
      '15-10',
      'abc',
      '1-2-3',
      '1e3',
      '1,2.3',
      'Infinity',
      '9'.repeat(400)
    ]) {
      await fill('time', invalid)
      assert.equal(await js('document.querySelector(".save-card").disabled'), true, invalid)
      assert.equal(
        await js('document.querySelector("[name=time]").getAttribute("aria-invalid")'),
        'true',
        invalid
      )
      await key('Return', ['control'])
      assert.equal(saved().cards.length, 4)
    }
    for (const valid of ['0', '10-15', '1,5 - 2,5', '12.25', '10-10']) {
      await fill('time', valid)
      assert.equal(await js('document.querySelector(".save-card").disabled'), false, valid)
    }
    await fill('revenue', '300-150')
    assert.equal(await js('document.querySelector(".save-card").disabled'), true)
    await fill('revenue', '150,50 - 300.75')
    await fill('time', '10-15')
    await fill('description', 'Eine Zeile\nZweite Zeile')
    await fill('currency', 'CHF')
    await key('Return')
    assert.equal(await js('!!document.querySelector(".card-form")'), true)
    // Two synchronous submissions must create exactly one card.
    await js(
      `document.querySelector('.card-form').requestSubmit(); document.querySelector('.card-form').requestSubmit()`
    )
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(saved().cards.length, 5)
    const created = saved().cards.find((c) => c.title === 'Neu')
    assert.ok(created.id)
    assert.equal(created.month, 0)
    assert.equal(created.order, 8)
    assert.equal(created.currency, 'CHF')
    assert.deepEqual([created.revenueMin, created.revenueMax], [150.5, 300.75])
    assert.equal(
      await js(
        `document.querySelector('[data-card-id="${created.id}"] .card-description').querySelectorAll('li').length`
      ),
      2
    )

    // Open the gear using actual mouse input.
    const gear = await js(
      `(() => { const e = document.querySelector('[data-card-id="Buchsatz"] .card-settings').getBoundingClientRect(); return { x: Math.round(e.x + e.width/2), y: Math.round(e.y + e.height/2) } })()`
    )
    win.webContents.sendInputEvent({ type: 'mouseMove', ...gear })
    await pause()
    win.webContents.sendInputEvent({ type: 'mouseDown', ...gear, button: 'left', clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', ...gear, button: 'left', clickCount: 1 })
    await waitFor('!!document.querySelector(".card-form")')
    assert.equal(
      await js(
        'document.querySelector(".month-cards").firstElementChild.classList.contains("card-form")'
      ),
      true
    )
    assert.equal(await js('document.querySelector("[name=revenue]").value'), '1000,5-2000')
    assert.equal(await js('document.querySelector("[name=description]").value'), 'Zeile 1\nZeile 2')
    assert.equal(await js('document.querySelector(".secondary-action").textContent'), 'Löschen')
    await fill('title', 'Nicht speichern')
    await key('Escape')
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(saved().cards.find((c) => c.id === 'Buchsatz').title, 'Buchsatz')
    await click('[data-card-id="Buchsatz"] .card-settings')
    await fill('title', 'Überarbeitet')
    await fill('description', '')
    await key('Return', ['control'])
    await waitFor('!document.querySelector(".card-form")')
    const edited = saved().cards.find((c) => c.id === 'Buchsatz')
    assert.equal(edited.title, 'Überarbeitet')
    assert.equal(edited.description, '')
    assert.equal(edited.order, 2)
    assert.equal(edited.expanded, false)
    assert.equal(
      await js('document.querySelector("[data-card-id=Buchsatz] .description-toggle") === null'),
      true
    )

    await click(`[data-card-id="${created.id}"] .card-settings`)
    await click('.delete-card')
    await waitFor('document.querySelector("dialog").open')
    assert.equal(await js('document.activeElement.className'), 'dialog-cancel')
    await key('Escape')
    await waitFor('!document.querySelector("dialog").open')
    assert.equal(await js('!!document.querySelector(".card-form")'), true)
    assert.equal(saved().cards.length, 5)
    await click('.delete-card')
    await click('.dialog-cancel')
    assert.equal(saved().cards.length, 5)
    await click('.delete-card')
    fs.writeFileSync(
      path.join(output, 'delete-step4.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await click('.confirm-delete')
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(saved().cards.length, 4)
    assert.equal(
      saved().cards.some((c) => c.id === created.id),
      false
    )

    // Failure must keep the form and avoid committing canceled changes on resize.
    await click('.add-card')
    await fill('label', 'Kundin')
    await fill('title', 'Fehlversuch')
    await fill('time', '1')
    await fill('revenue', '2')
    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    await click('.save-card')
    await waitFor('!!document.querySelector(".form-error")')
    assert.equal(await js('document.querySelector("[name=title]").value'), 'Fehlversuch')
    assert.equal(saved().cards.length, 4)
    assert.equal(
      await js('(async () => (await window.capacityPlanner.loadData()).cards.length)()'),
      4
    )
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    await click('.secondary-action')
    win.setSize(960, 620)
    await pause(400)
    assert.equal(saved().cards.length, 4)
    // A later successful save clears the error and uses the chosen year/month.
    await click('[aria-label="Nächstes Jahr"]')
    await waitFor('document.querySelectorAll("[data-card-id]").length === 1')
    await click('.month-column:nth-child(3) .add-card')
    await fill('label', 'Neue Kundin')
    await fill('title', 'Neuer Auftrag')
    await fill('time', '0')
    await fill('revenue', '0')
    await fill('currency', 'CHF')
    assert.equal(
      await js(
        'document.querySelector(".month-column:nth-child(3) .month-cards").scrollWidth === document.querySelector(".month-column:nth-child(3) .month-cards").clientWidth'
      ),
      true
    )
    await key('Return', ['control'])
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(saved().cards.length, 5)
    assert.equal(await js('document.querySelector(".load-error") === null'), true)
    await click('.month-column:nth-child(3) .add-card')
    await click('.secondary-action')
    assert.equal(saved().cards.length, 5)
    win.setSize(1180, 760)
    await pause(400)
    await click('.month-column:nth-child(4) .add-card')
    assert.equal(await js('document.activeElement.name'), 'label')
    await fill('label', 'Auftraggeber Name')
    await fill('title', 'Buchsatz')
    await fill('description', '300 Seiten\nohne Kapitelzierden')
    await fill('time', '10-15')
    await fill('revenue', '150-300')
    await js('document.activeElement.blur()')
    fs.writeFileSync(
      path.join(output, 'form-step4.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await click('.secondary-action')
    assert.equal(
      await js(
        'document.querySelector(".month-column:nth-child(4)").contains(document.activeElement)'
      ),
      true
    )
    // Delete failure leaves card intact, retry succeeds.
    await click('[aria-label="Vorheriges Jahr"]')
    await waitFor('document.querySelectorAll("[data-card-id]").length === 3')
    await click('[data-card-id="Später"] .card-settings')
    await click('.delete-card')
    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    await click('.confirm-delete')
    await waitFor('!!document.querySelector(".form-error")')
    assert.equal(
      saved().cards.some((c) => c.id === 'Später'),
      true
    )
    assert.equal(
      await js(
        '(async () => (await window.capacityPlanner.loadData()).cards.some(c => c.id === "Später"))()'
      ),
      true
    )
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    await click('.delete-card')
    await click('.confirm-delete')
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(saved().cards.length, 4)
    assert.equal(
      saved().cards.some((c) => c.id === 'Später'),
      false
    )
    assert.equal(
      saved().cards.some((c) => c.id === 'Messe'),
      true
    )
    console.log(
      'PASS: create/edit/cancel/delete, confirmations, numeric validation, currency, shortcuts, duplicate submit, failure/retry, year/month and metadata'
    )
    await js('window.capacityPlanner.closeApp()')
  }
  require('../out/main/index.js')
}
