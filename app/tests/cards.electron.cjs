const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'step3-profile-'))
  const year = new Date().getFullYear()
  const card = (id, month, order, extra = {}) => ({
    id,
    year,
    month,
    order,
    label: 'Auftraggeber Name',
    title: id,
    description: '300 Seiten\r\n\r\n ohne Kapitelzierden',
    hoursMin: 10,
    hoursMax: 15,
    revenueMin: 150,
    revenueMax: 300,
    currency: 'EUR',
    expanded: true,
    ...extra
  })
  const cards = [
    card('Buchsatz', 0, 2),
    card('Fantasy Basel', 0, 3, {
      label: 'Messe',
      description: ' \r\n\t',
      hoursMin: 10,
      hoursMax: 10,
      revenueMin: 150.5,
      revenueMax: 150.5,
      currency: 'CHF'
    }),
    card('Erster Auftrag', 0, 1, { expanded: false }),
    ...Array.from({ length: 11 }, (_, i) => card(`Monat ${i + 2}`, i + 1, 0)),
    ...Array.from({ length: 12 }, (_, i) => card(`Zusatz ${i}`, 1, i + 1)),
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
        timeout: 45000,
        windowsHide: true
      })
      console.log(result.stdout)
      if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    }
    console.log('PASS: Electron integration checks and persistence after restart')
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('step3-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app } = require('electron')
  const profile = process.argv[2]
  const phase = process.argv[3]
  app.setPath('userData', profile)
  app.on('browser-window-created', (_, win) => {
    win.once('ready-to-show', () => {
      run(win).catch((error) => {
        console.error(error)
        app.exit(1)
      })
    })
  })
  const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
  async function run(win) {
    const js = (code) => win.webContents.executeJavaScript(code, true)
    const waitFor = async (code) => {
      for (let i = 0; i < 100; i++) {
        if (await js(code)) return
        await pause()
      }
      throw new Error(`Timed out: ${code}`)
    }
    await waitFor('document.querySelectorAll(".planner-card").length === 26')
    const errors = []
    win.webContents.on('console-message', (_, details) => {
      if (details.level === 'error') errors.push(details.message)
    })
    const initial = await js(`(() => {
      const columns = [...document.querySelectorAll('.month-column')];
      return {
        titles: columns[0].querySelectorAll('.card-title').length && [...columns[0].querySelectorAll('.card-title')].map(e => e.textContent),
        counts: columns.map(c => c.querySelectorAll('.planner-card').length),
        empty: columns[0].querySelectorAll('.planner-card')[2].querySelector('.card-description, .description-toggle') === null,
        values: columns[0].querySelectorAll('.planner-card')[2].querySelector('.card-values').textContent,
        bullets: columns[0].querySelectorAll('.planner-card')[1].querySelectorAll('li').length,
        expanded: columns[0].querySelectorAll('.description-toggle')[1].getAttribute('aria-expanded')
      };
    })()`)
    assert.deepEqual(initial.titles, ['Erster Auftrag', 'Buchsatz', 'Fantasy Basel'])
    assert.deepEqual(initial.counts, [3, 13, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    assert.equal(initial.empty, true)
    assert.equal(initial.values, '10 h150,5 CHF')
    assert.equal(initial.bullets, 2)
    assert.equal(initial.expanded, phase === 'initial' ? 'true' : 'false')
    if (phase === 'restart') {
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
      assert.equal(saved.cards.find((c) => c.id === 'Buchsatz').expanded, false)
      assert.equal(saved.cards.find((c) => c.id === 'Erster Auftrag').expanded, true)
      console.log('PASS: persisted card states restored from disk')
      await js('window.capacityPlanner.closeApp()')
      return
    }
    const hover = async (x, y) => {
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
      await pause(180)
    }
    await hover(700, 25)
    assert.equal(
      await js('getComputedStyle(document.querySelector(".card-settings")).opacity'),
      '0'
    )
    assert.equal(await js('getComputedStyle(document.querySelector(".add-card")).opacity'), '0')
    await hover(245, 330)
    assert.equal(await js('getComputedStyle(document.querySelector(".add-card")).opacity'), '1')
    assert.equal(
      await js('getComputedStyle(document.querySelector(".card-settings")).opacity'),
      '0'
    )
    await hover(80, 145)
    assert.equal(
      await js('getComputedStyle(document.querySelector(".card-settings")).opacity'),
      '1'
    )
    assert.equal(
      await js('getComputedStyle(document.querySelectorAll(".card-settings")[1]).opacity'),
      '0'
    )
    await js(
      `document.querySelectorAll('.description-toggle')[1].click(); document.querySelectorAll('.description-toggle')[0].click()`
    )
    await waitFor(
      `document.querySelectorAll('.description-toggle')[1].getAttribute('aria-expanded') === 'false'`
    )
    assert.equal(await js('document.querySelectorAll(".card-description")[1].hidden'), true)
    await waitFor(
      `document.querySelectorAll('.description-toggle')[0].getAttribute('aria-expanded') === 'true'`
    )
    await js(`document.querySelectorAll('.description-toggle')[1].focus()`)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor(
      `document.querySelectorAll('.description-toggle')[1].getAttribute('aria-expanded') === 'true'`
    )
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor(
      `document.querySelectorAll('.description-toggle')[1].getAttribute('aria-expanded') === 'false'`
    )
    win.setSize(960, 620)
    await pause()
    assert.equal(
      await js(
        `document.querySelector('.month-cards').scrollWidth === document.querySelector('.month-cards').clientWidth`
      ),
      true
    )
    win.setSize(1180, 760)
    await pause()
    await js(`document.querySelector('[aria-label="Nächstes Jahr"]').click()`)
    await waitFor('document.querySelectorAll(".planner-card").length === 1')
    assert.equal(await js('document.querySelector(".card-title").textContent'), 'Anderes Jahr')
    await js(`document.querySelector('[aria-label="Vorheriges Jahr"]').click()`)
    await waitFor('document.querySelectorAll(".planner-card").length === 26')
    const scroll = await js(`(() => {
      const lists = document.querySelectorAll('.month-cards');
      const top = document.querySelectorAll('.month-heading')[1].getBoundingClientRect().top;
      const bottom = document.querySelectorAll('.month-footer')[1].getBoundingClientRect().top;
      lists[1].scrollTop = 400;
      const board = document.querySelector('.year-board');
      board.scrollLeft = board.scrollWidth;
      const result = {
        vertical: lists[1].scrollTop > 0 && lists[0].scrollTop === 0,
        fixed: top === document.querySelectorAll('.month-heading')[1].getBoundingClientRect().top && bottom === document.querySelectorAll('.month-footer')[1].getBoundingClientRect().top,
        horizontal: board.scrollLeft > 0
      };
      board.scrollLeft = 0; lists[1].scrollTop = 0;
      return result;
    })()`)
    assert.deepEqual(scroll, { vertical: true, fixed: true, horizontal: true })
    await hover(245, 340)
    fs.writeFileSync(
      path.join(output, 'cards-step3.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    for (let i = 0; i < 100; i++) {
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
      if (
        !saved.cards.find((c) => c.id === 'Buchsatz').expanded &&
        saved.cards.find((c) => c.id === 'Erster Auftrag').expanded
      )
        break
      if (i === 99) throw new Error('Persistence timeout')
      await pause()
    }
    // A failed save must leave a visible error; a later successful save clears it.
    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    await js(`document.querySelector('.description-toggle').click()`)
    await waitFor('!!document.querySelector("[role=alert]")')
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    await js(`document.querySelector('.description-toggle').click()`)
    await waitFor('!document.querySelector("[role=alert]")')
    assert.deepEqual(errors, [])
    console.log(
      'PASS: month/year/order, values, blank description, hover, rapid toggles, scroll and save error'
    )
    await js('window.capacityPlanner.closeApp()')
  }
  require('../out/main/index.js')
}
