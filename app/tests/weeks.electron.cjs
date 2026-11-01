// Run against the Electron build: npm run build && node tests/weeks.electron.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  fs.mkdirSync(output, { recursive: true })
  const profile = fs.mkdtempSync(path.join(output, 'weeks-profile-'))
  const year = new Date().getFullYear()
  const card = (id, order) => ({
    id,
    year,
    month: 1,
    order,
    label: 'Auftraggeber',
    title: id,
    description: 'Zeile',
    minutesMin: 600,
    minutesMax: 900,
    timeUnit: 'h',
    revenueMin: 150,
    revenueMax: 300,
    currency: 'EUR',
    expanded: false
  })
  // An existing version-2 file without any week: it must load unchanged into "Ohne KW".
  const original = { version: 2, cards: [card('P', 0), card('Q', 1), card('R', 2)] }
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify(original))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    for (const phase of ['initial', 'restart']) {
      const result = spawnSync(require('electron'), [__filename, profile, phase], {
        env,
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true
      })
      console.log(result.stdout)
      if (result.status !== 0)
        throw new Error(
          `Electron status=${result.status}, signal=${result.signal}, error=${result.error ?? 'none'}\n${result.stderr}`
        )
    }
    const backup = JSON.parse(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8'))
    assert.equal(backup.version, 2)
    console.log(
      'PASS: week grouping setting, groups, "+" per week, drag between weeks, double-click edit and restart'
    )
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('weeks-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app } = require('electron')
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
    const read = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    const byId = (id) => read().cards.find((card) => card.id === id)
    // data.json is written with a short debounce, so file checks poll.
    const until = async (check) => {
      for (let i = 0; i < 150; i++) {
        try {
          if (check()) return
        } catch {
          // A file being replaced is retried.
        }
        await pause()
      }
      throw new Error(`Timed out: ${check}`)
    }
    const column = '[data-month="1"]'
    const weeks = () =>
      js(
        `[...document.querySelectorAll('${column} .week-group')].map(el => el.dataset.week).filter(week => week !== 'none').map(Number)`
      )
    const group = (week) =>
      js(
        `[...document.querySelectorAll('${column} .week-group[data-week="${week}"] [data-card-id]')].map(el => el.dataset.cardId)`
      )
    const point = async (selector, fraction = 0.5) =>
      js(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * ${fraction}) };
    })()`)
    const mouse = (type, p, extra = {}) =>
      win.webContents.sendInputEvent({ type, x: p.x, y: p.y, ...extra })
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await pause()
    }
    const fill = async (name, value) => {
      await js(`(() => {
        const el = document.querySelector('${column} [name="${name}"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await pause(15)
    }
    const expectGroup = (week, ids) =>
      waitFor(
        `JSON.stringify([...document.querySelectorAll('${column} .week-group[data-week="${week}"] [data-card-id]')].map(el => el.dataset.cardId)) === ${JSON.stringify(JSON.stringify(ids))}`
      )
    const drag = async (id, selector, fraction = 0.5) => {
      // A drag only starts once the previous save has finished.
      await waitFor(
        '[...document.querySelectorAll(".sortable-card")].every(el => el.getAttribute("aria-disabled") !== "true")'
      )
      const start = await point(`[data-card-id="${id}"] .card-title`)
      mouse('mouseMove', start)
      await pause()
      mouse('mouseDown', start, { button: 'left', clickCount: 1 })
      mouse('mouseMove', { x: start.x + 9, y: start.y + 2 }, { modifiers: ['leftButtonDown'] })
      await waitFor('!!document.querySelector(".card-drag-overlay")')
      const end = await point(selector, fraction)
      mouse('mouseMove', end, { modifiers: ['leftButtonDown'] })
      await pause(120)
      mouse('mouseUp', end, { button: 'left', clickCount: 1 })
      await waitFor('!document.querySelector(".card-drag-overlay")')
      await pause(450)
    }
    await waitFor(
      'document.querySelectorAll(".month-column").length === 12 && document.querySelectorAll(".sortable-card").length >= 3'
    )
    win.focus()

    if (phase === 'restart') {
      const [first, second, third] = await weeks()
      assert.ok(first, 'grouping stays on after a restart')
      assert.deepEqual(await group(second), ['P', 'Q'])
      const created = read().cards.find((card) => card.title === 'New')
      assert.deepEqual(await group(first), ['R'])
      assert.deepEqual(await group(third), [created.id])
      assert.deepEqual(await group('none'), [])
      console.log('PASS: restart keeps the setting, the week assignment and the order')
      win.close()
      return
    }

    // Default: off, no week headings; the footer is compact.
    assert.equal(await js('document.querySelectorAll(".week-group").length'), 0)
    assert.ok((await js('document.querySelector(".month-footer").offsetHeight')) < 100)

    // Double-click opens the editor in place; a double-click on a button does not.
    const title = await point('[data-card-id="P"] .card-title')
    for (const clickCount of [1, 2]) {
      mouse('mouseDown', title, { button: 'left', clickCount })
      mouse('mouseUp', title, { button: 'left', clickCount })
    }
    await waitFor(`!!document.querySelector('${column} .card-form')`)
    assert.equal(
      await js(`document.querySelector('${column} .form-heading span').textContent`),
      'Karte bearbeiten'
    )
    await click(`${column} .form-close`)
    await waitFor(`!document.querySelector('${column} .card-form')`)
    const toggle = await point('[data-card-id="Q"] .description-toggle')
    for (const clickCount of [1, 2]) {
      mouse('mouseDown', toggle, { button: 'left', clickCount })
      mouse('mouseUp', toggle, { button: 'left', clickCount })
    }
    await pause(200)
    assert.equal(await js(`!!document.querySelector('${column} .card-form')`), false)
    console.log('PASS: double-click edits, buttons keep their own behaviour')

    // Settings → Ansicht turns the grouping on.
    await click('.settings-open')
    await waitFor('!!document.querySelector(".settings-dialog[open]")')
    await click('.settings-nav-item:nth-child(4)')
    await waitFor('!!document.querySelector("[name=weekGrouping]")')
    assert.equal(await js('document.querySelector("[name=weekGrouping]").checked'), false)
    await click('[name=weekGrouping]')
    await click('.settings-close')
    await waitFor('!document.querySelector(".settings-dialog[open]")')
    assert.equal(await js('localStorage.getItem("capacity-planner:week-grouping")'), 'true')
    await waitFor(`document.querySelectorAll('${column} .week-group').length >= 5`)
    const [first, second, third] = await weeks()
    assert.ok([4, 5, 6].includes((await weeks()).length))
    assert.match(
      await js(
        `document.querySelector('${column} .week-group[data-week="${first}"] .week-title').textContent`
      ),
      new RegExp(`^KW ${first}`)
    )
    assert.deepEqual(await group('none'), ['P', 'Q', 'R'])
    assert.equal(
      read().cards.some((card) => 'week' in card),
      false
    )
    console.log('PASS: setting in Ansicht, week headings, existing cards under "Ohne KW"')
    await pause(300)

    // Drag between weeks: into an empty week, then above a card of that week.
    await drag('Q', `${column} .week-group[data-week="${second}"] .week-heading`)
    await expectGroup(second, ['Q'])
    await until(() => byId('Q').week === second)
    await drag('P', '[data-card-id="Q"]', 0.2)
    await expectGroup(second, ['P', 'Q'])
    await until(() => byId('P').week === second && byId('P').order < byId('Q').order)
    await drag('R', `${column} .week-group[data-week="${first}"] .week-heading`)
    await expectGroup(first, ['R'])
    await until(() => byId('R').week === first)
    assert.deepEqual(await group('none'), [])
    console.log('PASS: drag into an empty week and before a card of another week')

    // Week total in the heading.
    assert.match(
      await js(
        `document.querySelector('${column} .week-group[data-week="${second}"] .week-totals').textContent`
      ),
      /300-600 EUR/
    )

    // "+" of a week creates the card in that week.
    await click(`${column} .week-group[data-week="${third}"] .add-card`)
    await waitFor(
      `!!document.querySelector('${column} .week-group[data-week="${third}"] .card-form')`
    )
    await fill('label', 'Neu')
    await fill('title', 'New')
    await fill('time', '2')
    await fill('revenue', '100')
    await click(`${column} .save-card`)
    await waitFor(`!document.querySelector('${column} .card-form')`)
    await until(() => read().cards.some((card) => card.title === 'New'))
    const created = read().cards.find((card) => card.title === 'New')
    assert.equal(created.week, third)
    assert.deepEqual(await group(third), [created.id])
    console.log('PASS: "+" per week saves the card into that week')

    // Turning the grouping off only hides the headings.
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(4)')
    await click('[name=weekGrouping]')
    await click('.settings-close')
    await waitFor('document.querySelectorAll(".week-group").length === 0')
    assert.equal(byId('Q').week, second)
    assert.equal(await js('localStorage.getItem("capacity-planner:week-grouping")'), 'false')
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(4)')
    await click('[name=weekGrouping]')
    await click('.settings-close')
    await waitFor(`document.querySelectorAll('${column} .week-group').length >= 5`)
    console.log('PASS: switching off keeps the assignment')
    win.close()
  }
  require('../out/main/index.js')
}
