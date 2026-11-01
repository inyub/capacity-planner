// Run against the Windows Electron build: npm run build && node tests/drag-drop.electron.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'step6-profile-'))
  const year = new Date().getFullYear()
  const card = (id, month, order, extra = {}) => ({
    id,
    year,
    month,
    order,
    label: 'Auftraggeber',
    title: id,
    description: '300 Seiten\nOhne Kapitelzierden',
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
    card('B', 0, 1),
    card('C', 0, 2),
    card('X', 1, 0),
    card('Y', 1, 1),
    ...Array.from({ length: 18 }, (_, i) => card(`Tall-${i}`, 3, i, { expanded: true })),
    ...Array.from({ length: 15 }, (_, i) => card(`May-${i}`, 4, i, { expanded: true })),
    card('December', 11, 0),
    card('Other-year', 0, 0, { year: year + 1 })
  ]
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ version: 1, cards }))
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
    console.log(
      'PASS: Windows Electron drag/drop, both auto-scroll axes, errors and restart persistence'
    )
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('step6-profile-'))
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
    const list = (month) =>
      js(
        `[...document.querySelector('[data-month="${month}"]').querySelectorAll('[data-card-id]')].map(el => el.dataset.cardId)`
      )
    const point = async (selector, fraction = 0.5) =>
      js(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * ${fraction}) };
    })()`)
    const move = async (p, held = true) => {
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: p.x,
        y: p.y,
        modifiers: held ? ['leftButtonDown'] : []
      })
      await pause()
    }
    const key = async (keyCode) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
      await pause()
    }
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await pause()
    }
    const begin = async (id) => {
      const p = await point(`[data-card-id="${id}"] .card-title`)
      await move(p, false)
      win.webContents.sendInputEvent({
        type: 'mouseDown',
        x: p.x,
        y: p.y,
        button: 'left',
        clickCount: 1
      })
      await move({ x: p.x + 9, y: p.y + 2 })
      await waitFor('!!document.querySelector(".card-drag-overlay")')
    }
    const release = async (p) => {
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        x: p.x,
        y: p.y,
        button: 'left',
        clickCount: 1
      })
      await waitFor('!document.querySelector(".card-drag-overlay")')
      await pause(450)
    }
    const drag = async (id, selector, fraction = 0.5) => {
      await begin(id)
      const p = await point(selector, fraction)
      await move(p)
      await release(p)
    }
    const scrolls = () =>
      js(
        `({ x: document.querySelector('.year-board').scrollLeft, y: [...document.querySelectorAll('.month-cards')].map(el => el.scrollTop) })`
      )
    const resetScroll = async () => {
      await js(
        `document.querySelector('.year-board').scrollLeft = 0; document.querySelectorAll('.month-cards').forEach(el => el.scrollTop = 0)`
      )
      await pause()
    }
    const settled = () =>
      waitFor(
        '[...document.querySelectorAll(".sortable-card")].every(el => el.getAttribute("aria-disabled") !== "true")'
      )
    await waitFor(
      'document.querySelectorAll(".month-column").length === 12 && document.querySelectorAll(".sortable-card").length === 39'
    )
    win.focus()
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(profile, 'expected.json'), 'utf8'))
      assert.deepEqual(read().cards, expected.cards)
      for (let month = 0; month < 12; month++) {
        assert.deepEqual(
          await list(month),
          expected.cards
            .filter((c) => c.year === new Date().getFullYear() && c.month === month)
            .sort((a, b) => a.order - b.order)
            .map((c) => c.id)
        )
      }
      assert.equal(read().cards.find((c) => c.id === 'Other-year').month, 0)
      assert.equal(
        await js(
          'document.querySelector("[data-card-id=A] .description-toggle").getAttribute("aria-expanded")'
        ),
        'false'
      )
      console.log('PASS: exact months/order/metadata restored in a new Electron process')
      win.close()
      return
    }

    await click('[data-card-id=A] .card-settings')
    const formPoint = await point('.form-heading')
    await move(formPoint, false)
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      ...formPoint,
      button: 'left',
      clickCount: 1
    })
    const away = await point('[data-month="1"]')
    await move(away)
    win.webContents.sendInputEvent({ type: 'mouseUp', ...away, button: 'left', clickCount: 1 })
    assert.equal(await js('!!document.querySelector(".card-drag-overlay")'), false)
    assert.equal(await js('document.querySelector("[name=title]").value'), 'A')
    assert.equal(read().cards.find((c) => c.id === 'A').month, 0)
    await js('document.querySelector("[name=title]").focus()')
    await key('Escape')
    await settled()
    console.log('PASS: editing card cannot be dragged; form values and native Esc preserved')

    await drag('A', '[data-card-id=C] .card-title')
    assert.deepEqual(await list(0), ['B', 'C', 'A'])
    await drag('A', '[data-card-id=B] .card-title')
    assert.deepEqual(await list(0), ['A', 'B', 'C'])
    await drag('A', '[data-card-id=X]', 0.2)
    assert.deepEqual(await list(1), ['A', 'X', 'Y'])
    await drag('C', '[data-card-id=Y]', 0.8)
    assert.deepEqual(await list(1), ['A', 'X', 'Y', 'C'])
    await drag('B', '[data-month="2"]', 0.4)
    assert.deepEqual(await list(0), [])
    assert.deepEqual(await list(2), ['B'])
    assert.equal(await js('document.querySelector(".month-totals").children[0].textContent'), '–')
    assert.equal(
      await js('document.querySelectorAll(".month-totals")[1].children[0].textContent'),
      '1d 16h 0m – 2d 12h 0m'
    )
    assert.deepEqual(
      read()
        .cards.filter((c) => c.month === 1 && c.year === new Date().getFullYear())
        .sort((a, b) => a.order - b.order)
        .map((c) => [c.id, c.order]),
      [
        ['A', 0],
        ['X', 1],
        ['Y', 2],
        ['C', 3]
      ]
    )
    console.log(
      'PASS: reorder up/down, cross-month insert before/after, empty month, totals and durable order'
    )

    const beforeCancel = read().cards
    await begin('A')
    await move(await point('[data-month="0"]', 0.4))
    await key('Escape')
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      x: 100,
      y: 300,
      button: 'left',
      clickCount: 1
    })
    await pause(400)
    assert.deepEqual(read().cards, beforeCancel)
    await drag('A', '.planner-header')
    assert.deepEqual(read().cards, beforeCancel)
    console.log('PASS: Escape and drops outside lists leave data unchanged')

    // A real atomic-write failure must revert the optimistic UI, then allow the same drag again.
    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    await drag('A', '[data-month="0"]', 0.4)
    await waitFor('!!document.querySelector(".load-error")')
    assert.deepEqual(await list(1), ['A', 'X', 'Y', 'C'])
    assert.deepEqual(read().cards, beforeCancel)
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    await drag('A', '[data-month="0"]', 0.4)
    assert.deepEqual(await list(0), ['A'])
    assert.equal(await js('!!document.querySelector(".load-error")'), false)
    console.log('PASS: failed save rolls back UI and disk; retry succeeds')

    await resetScroll()
    const stationary = await js(
      `[...document.querySelectorAll('.month-heading, .month-footer')].map(el => el.getBoundingClientRect().top)`
    )
    await begin('Tall-0')
    const down = await point('[data-month="3"]', 0.995)
    await move(down)
    await pause(650)
    const lower = await scrolls()
    assert.ok(lower.y[3] > 150, JSON.stringify(lower))
    assert.equal(lower.x, 0)
    assert.ok(lower.y.every((y, i) => i === 3 || y === 0))
    assert.deepEqual(
      await js(
        `[...document.querySelectorAll('.month-heading, .month-footer')].map(el => el.getBoundingClientRect().top)`
      ),
      stationary
    )
    await move(await point('[data-month="3"]', 0.005))
    await pause(450)
    const upper = await scrolls()
    assert.ok(upper.y[3] < lower.y[3] - 100)
    await key('Escape')
    win.webContents.sendInputEvent({ type: 'mouseUp', ...down, button: 'left', clickCount: 1 })
    await pause(80)
    const stopped = await scrolls()
    await pause(200)
    assert.deepEqual(await scrolls(), stopped)
    console.log(
      'PASS: vertical auto-scroll down/up only in hovered column, stationary headers/footers, stops on cancel'
    )

    // Sorting must use the updated item rectangles after vertical edge scrolling.
    await resetScroll()
    await begin('Tall-0')
    await move(down)
    await pause(950)
    // Neighbouring cards already animate out of the way. Aim at the actual list slot.
    const fifthSlot = await js(`(() => {
      const el = document.querySelector('[data-card-id="Tall-5"]').parentElement;
      const r = el.getBoundingClientRect();
      const offset = new DOMMatrix(getComputedStyle(el).transform).m42;
      return { x: Math.round(r.left+r.width/2), y: Math.round(r.top-offset+r.height/2) };
    })()`)
    await move(fifthSlot)
    await release(fifthSlot)
    assert.deepEqual((await list(3)).slice(0, 6), [
      'Tall-1',
      'Tall-2',
      'Tall-3',
      'Tall-4',
      'Tall-5',
      'Tall-0'
    ])
    // Keep that scrolled column in place and move a card into its visible middle.
    await begin('A')
    await move(await point('[data-card-id="Tall-5"]', 0.2))
    await release(await point('[data-card-id="Tall-5"]', 0.2))
    assert.deepEqual((await list(3)).slice(0, 7), [
      'Tall-1',
      'Tall-2',
      'Tall-3',
      'Tall-4',
      'A',
      'Tall-5',
      'Tall-0'
    ])
    await drag('A', '[data-month="0"]', 0.4)
    console.log('PASS: reorder and cross-month insertion after vertical auto-scroll')

    await resetScroll()
    await begin('A')
    const right = await js(
      `(() => { const r=document.querySelector('.year-board').getBoundingClientRect(); return { x: Math.round(r.right-4), y: Math.round(r.top+r.height/2) } })()`
    )
    await move(right)
    await pause(650)
    const rightward = await scrolls()
    assert.ok(rightward.x > 200, JSON.stringify(rightward))
    const left = { x: 5, y: right.y }
    await move(left)
    await pause(350)
    assert.ok((await scrolls()).x < rightward.x - 100)
    await move({ x: 600, y: right.y })
    await pause(150)
    const center = await scrolls()
    await pause(200)
    assert.deepEqual(await scrolls(), center)
    await key('Escape')
    win.webContents.sendInputEvent({ type: 'mouseUp', ...left, button: 'left', clickCount: 1 })
    console.log(
      'PASS: horizontal auto-scroll right/left, reverses while held, stops away from edge'
    )

    // Reach December using only auto-scroll and drop there, then return via the left edge.
    await resetScroll()
    await begin('A')
    await move(right)
    await waitFor(
      `(() => { const el=document.querySelector('.year-board'); return el.scrollLeft >= el.scrollWidth-el.clientWidth-1 })()`
    )
    assert.ok((await scrolls()).x > 1700)
    await move(await point('[data-card-id=December]', 0.2))
    await release(await point('[data-card-id=December]', 0.2))
    assert.deepEqual(await list(11), ['A', 'December'])
    await begin('A')
    await move(left)
    await waitFor('document.querySelector(".year-board").scrollLeft <= 1')
    await move(await point('[data-month="0"]', 0.4))
    await release(await point('[data-month="0"]', 0.4))
    assert.deepEqual(await list(0), ['A'])
    console.log('PASS: January → December → January via horizontal edge scrolling with real drops')

    await resetScroll()
    await begin('Tall-1')
    const corner = { x: right.x, y: down.y }
    await move(corner)
    await pause(500)
    const diagonal = await scrolls()
    assert.ok(diagonal.x > 100 && diagonal.y[4] > 50, JSON.stringify(diagonal))
    await key('Escape')
    win.webContents.sendInputEvent({ type: 'mouseUp', ...corner, button: 'left', clickCount: 1 })
    await pause(100)
    console.log('PASS: simultaneous horizontal and vertical edge auto-scroll in destination column')

    await resetScroll()
    await js('document.querySelector("[data-card-id=X]").parentElement.focus()')
    await key('Space')
    await waitFor('!!document.querySelector(".card-drag-overlay")')
    await key('Down')
    await key('Space')
    await pause(450)
    assert.deepEqual(await list(1), ['Y', 'X', 'C'])
    console.log('PASS: keyboard sorting with Space/ArrowDown/Space')

    await click('[aria-label="Nächstes Jahr"]')
    await waitFor('document.querySelectorAll(".sortable-card").length === 1')
    assert.equal(await js('document.querySelector("[data-card-id]").dataset.cardId'), 'Other-year')
    await click('[aria-label="Vorheriges Jahr"]')
    await waitFor('document.querySelectorAll(".sortable-card").length === 39')
    const final = read()
    assert.equal(final.cards.find((c) => c.id === 'Other-year').month, 0)
    fs.writeFileSync(path.join(profile, 'expected.json'), JSON.stringify(final))
    fs.writeFileSync(
      path.join(output, 'drag-drop-step6.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    console.log('PASS: year isolation; screenshot saved to out/drag-drop-step6.png')
    win.close()
  }
  require('../out/main/index.js')
}
