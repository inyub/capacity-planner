const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'view-profile-'))
  const cards = Array.from({ length: 16 }, (_, order) => ({
    id: `Tall-${order}`,
    year: new Date().getFullYear(),
    month: 1,
    order,
    label: 'Auftraggeber mit einem langen Namen',
    title: `Buchsatz ${order}`,
    description: '300 Seiten\nOhne Kapitelzierden\nZusätzliche Details',
    hoursMin: 10,
    hoursMax: 15,
    revenueMin: 150,
    revenueMax: 300,
    currency: order % 2 ? 'EUR' : 'CHF',
    expanded: true
  }))
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ version: 1, cards }))
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
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('view-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app } = require('electron')
  const profile = process.argv[2]
  const phase = process.argv[3]
  app.setPath('userData', profile)
  const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
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
      throw new Error(
        `Timed out: ${code}\n${JSON.stringify(await js('({active:document.activeElement?.outerHTML,focus:document.hasFocus(),keyboard:document.documentElement.dataset.keyboardNavigation,forms:document.querySelectorAll(".card-form").length})'))}`
      )
    }
    const key = async (keyCode, modifiers = []) => {
      win.focus()
      win.webContents.focus()
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      if (keyCode === 'Return' || keyCode === 'Enter')
        win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      await pause()
    }
    const move = async (x, y) => {
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
      await pause(180)
    }
    const fill = async (selector, value) => {
      await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});
        el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
      await pause()
    }
    const width = () =>
      js('Math.round(document.querySelector(".month-column").getBoundingClientRect().width)')
    const read = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    const hidden = () =>
      js('getComputedStyle(document.querySelector("[data-month=\\"0\\"] .add-card")).opacity')
    const click = async (selector) => {
      const point = await js(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        el.scrollIntoView({block:'nearest',inline:'nearest'});
        const r = el.getBoundingClientRect();
        return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
      })()`)
      await move(point.x, point.y)
      win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      await pause()
    }
    await waitFor('document.querySelector(".add-card")?.disabled === false')
    win.focus()
    win.webContents.focus()
    await pause(200)
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(profile, 'expected.json'), 'utf8'))
      assert.equal(await width(), 315)
      assert.equal(
        await js('Number(document.querySelector(".selected-year").textContent)'),
        expected.year
      )
      assert.deepEqual(read().cards, expected.cards)
      await click('[aria-label="Spaltenbreite zurücksetzen"]')
      assert.equal(await width(), 252)
      assert.equal(
        await js('Number(document.querySelector(".selected-year").textContent)'),
        expected.year
      )
      assert.deepEqual(read().cards, expected.cards)
      console.log(
        'PASS: width and selected year restored in a new process; Reset preserves cards/year'
      )
      win.close()
      return
    }
    await click('[data-month="0"] .add-card')
    await waitFor('!!document.querySelector(".card-form")')
    assert.equal(await js('!!document.querySelector("[data-month=\\"0\\"] .add-card")'), false)
    await fill('[name=label]', 'Auftraggeber')
    await click('.card-form .secondary-action')
    await waitFor('!document.querySelector(".card-form")')
    await move(450, 200)
    assert.equal(await js('document.activeElement.matches("[data-month=\\"0\\"] .add-card")'), true)
    assert.equal(
      await js('getComputedStyle(document.querySelector(".add-card")).opacity'),
      '0',
      `pointer-driven focus return must not keep Add visible after leaving the column: ${JSON.stringify(await js('({hover:[...document.querySelectorAll(".month-column:hover")].map(el=>el.textContent.slice(0,15)),mode:document.documentElement.dataset.keyboardNavigation,focus:document.hasFocus()})'))}`
    )
    console.log('PASS: Add hides after pointer cancel and mouse leave')

    await js('document.querySelector("[data-month=\\"0\\"]").focus()')
    await key('Tab')
    assert.equal(await js('document.activeElement.matches(".add-card")'), true)
    assert.equal(await hidden(), '1')
    await key('Return')
    await waitFor('!!document.querySelector(".card-form")')
    await key('Escape')
    assert.equal(await hidden(), '1', 'keyboard cancel restores a visible Add button')
    await move(451, 201)
    assert.equal(await hidden(), '0')

    await click('[data-month="0"] .add-card')
    for (const [name, value] of Object.entries({
      label: 'Test',
      title: 'Neuer Auftrag',
      time: '10-15',
      revenue: '150-300'
    }))
      await fill(`[name=${name}]`, value)
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(read().cards.length, 17)
    await move(452, 202)
    assert.equal(await hidden(), '0', 'saved form must not keep Add visible')
    await js('document.querySelector("[data-month=\\"0\\"] .add-card").focus()')
    await key(',', ['control'])
    await waitFor('!!document.querySelector(".theme-dialog[open]")')
    await key('Escape')
    assert.equal(await js('!!document.querySelector(".settings-dialog[open]")'), true)
    await key('Escape')
    await waitFor('!document.querySelector(".settings-dialog")')
    assert.equal(await js('document.activeElement.matches(".add-card")'), true)
    await move(453, 203)
    assert.equal(await hidden(), '0', 'dialog focus return must not keep Add visible')
    console.log('PASS: keyboard Add/Enter/Escape, save and return from nested dialogs')

    const boundsBeforeHeader = win.getBounds()
    await click('.settings-open')
    await waitFor('!!document.querySelector(".settings-dialog[open]")')
    assert.equal(await js('!!document.querySelector(".theme-dialog")'), false)
    await click('.settings-nav-item:nth-child(2)')
    assert.equal(
      await js('document.querySelector(".planning-data h3").textContent'),
      'Planungsdaten aller Jahre'
    )
    await key(',', ['control'])
    await waitFor('!!document.querySelector(".theme-dialog[open]")')
    await fill('[name=color-card]', '#123456')
    await key('Escape')
    assert.equal(
      await js('getComputedStyle(document.documentElement).getPropertyValue("--card").trim()'),
      '#4c456d'
    )
    assert.equal(read().appearance, undefined)
    assert.equal(await js('document.activeElement.matches(".settings-theme-edit")'), true)
    await click('.settings-close')
    assert.equal(await js('document.activeElement.matches(".settings-open")'), true)
    assert.deepEqual(win.getBounds(), boundsBeforeHeader)
    assert.equal(
      await js(
        `getComputedStyle(document.querySelector('.planner-header')).getPropertyValue('-webkit-app-region')`
      ),
      'drag'
    )
    assert.equal(
      await js(`[...document.querySelectorAll('.header-control')].every(el=>{
      const r=el.getBoundingClientRect();return r.width>=40&&r.width<=44&&r.height>=40&&r.height<=44&&getComputedStyle(el).getPropertyValue('-webkit-app-region')==='no-drag';})`),
      true
    )
    console.log(
      'PASS: settings/data/theme navigation, unsaved preview rollback, header focus, hit areas and drag regions'
    )

    assert.equal(await width(), 252)
    const cardsBeforeWidth = read().cards
    await fill('#column-width', '300')
    await js('document.querySelector("#column-width").focus()')
    await key('Right')
    assert.equal(await width(), 301)
    assert.equal(await js('document.querySelector(".view-toolbar output").textContent'), '301 px')
    await click('[aria-label="Spaltenbreite zurücksetzen"]')
    assert.equal(await width(), 252)
    assert.deepEqual(read().cards, cardsBeforeWidth)

    const point = (selector, fraction = 0.5) =>
      js(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height*${fraction})};
    })()`)
    const heldMove = async (p) => {
      win.webContents.sendInputEvent({ type: 'mouseMove', ...p, modifiers: ['leftButtonDown'] })
      await pause()
    }
    const begin = async () => {
      const p = await point('[data-card-id=Tall-0] .card-title')
      await move(p.x, p.y)
      win.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 })
      await heldMove({ x: p.x + 9, y: p.y + 2 })
      await waitFor('!!document.querySelector(".card-drag-overlay")')
      assert.equal(await js('document.querySelector("#column-width").disabled'), true)
    }
    const release = async (p) => {
      win.webContents.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 })
      await waitFor('!document.querySelector(".card-drag-overlay")')
      await pause(450)
    }
    const resetScroll = async () => {
      await js(
        'document.querySelector(".year-board").scrollLeft=0; document.querySelectorAll(".month-cards").forEach(el=>el.scrollTop=0)'
      )
      await pause()
    }
    for (const value of [180, 252, 360]) {
      await fill('#column-width', String(value))
      assert.equal(await width(), value)
      assert.equal(
        await js(
          `[...document.querySelectorAll('.month-column')].every(el=>Math.round(el.getBoundingClientRect().width)===${value})`
        ),
        true
      )
      assert.equal(
        await js(
          'new Set([...document.querySelectorAll(".month-footer")].map(el=>el.getBoundingClientRect().top)).size'
        ),
        1,
        'monthly footers align across empty and populated months'
      )
      await resetScroll()
      const stationary = await js(
        '[...document.querySelectorAll(".month-heading, .month-footer, .view-toolbar")].map(el=>el.getBoundingClientRect().top)'
      )
      await begin()
      const bottom = await point('[data-month="1"]', 0.98)
      await heldMove(bottom)
      await pause(400)
      assert.ok(await js('document.querySelector("[data-month=\\"1\\"]").scrollTop > 80'))
      assert.deepEqual(
        await js(
          '[...document.querySelectorAll(".month-heading, .month-footer, .view-toolbar")].map(el=>el.getBoundingClientRect().top)'
        ),
        stationary
      )
      assert.equal(
        await js(
          '[...document.querySelectorAll(".month-cards")].every((el,i)=>i===1||el.scrollTop===0)'
        ),
        true
      )
      await heldMove(await point('[data-month="1"]', 0.01))
      await pause(450)
      assert.ok(await js('document.querySelector("[data-month=\\"1\\"]").scrollTop < 30'))
      await key('Escape')
      await release(bottom)
      await resetScroll()
      await begin()
      const right = await js(
        '(()=>{const r=document.querySelector(".year-board").getBoundingClientRect();return {x:Math.round(r.right-4),y:Math.round(r.top+r.height/2)}})()'
      )
      await heldMove(right)
      await pause(450)
      const rightward = await js('document.querySelector(".year-board").scrollLeft')
      assert.ok(rightward > 100)
      await heldMove({ x: 4, y: right.y })
      await pause(450)
      assert.ok((await js('document.querySelector(".year-board").scrollLeft')) < rightward - 80)
      await key('Escape')
      await release(right)
      await resetScroll()
      await begin()
      const destination = await point('[data-month="2"]', 0.35)
      await heldMove(destination)
      await release(destination)
      assert.equal(read().cards.find((card) => card.id === 'Tall-0').month, 2)
      await begin()
      const source = await point('[data-month="1"]', 0.1)
      await heldMove(source)
      await release(source)
      assert.equal(read().cards.find((card) => card.id === 'Tall-0').month, 1)
      await resetScroll()
      await move(10, 30)
      assert.equal(await hidden(), '0', 'drag focus return must not keep Add visible')
      console.log(
        `PASS: ${value}px: cross-month drag, both scroll axes, independent vertical scrolling and fixed footers`
      )
    }

    win.setSize(960, 620)
    await pause(400)
    for (const value of [180, 360]) {
      await fill('#column-width', String(value))
      await resetScroll()
      await click('[data-month="0"] .add-card')
      await waitFor('!!document.querySelector(".card-form")')
      assert.equal(
        await js(
          'getComputedStyle(document.querySelector(".form-numbers")).gridTemplateColumns.split(" ").length'
        ),
        value === 180 ? 2 : 3
      )
      assert.equal(
        await js(`(()=>{const f=document.querySelector('.card-form'),r=f.getBoundingClientRect();
        return f.scrollWidth<=f.clientWidth && [...f.querySelectorAll('input,select,textarea')].every(el=>{const e=el.getBoundingClientRect();return e.left>=r.left && e.right<=r.right});})()`),
        true,
        `fields fit at ${value}px`
      )
      await js('document.querySelector("[name=time]").scrollIntoView({block:"center"})')
      await pause()
      fs.writeFileSync(
        path.join(output, `form-width-${value}.png`),
        (await win.webContents.capturePage()).toPNG()
      )
      await key('Escape')
      assert.equal(
        await js(
          '[...document.querySelectorAll(".month-footer")].every(el=>el.scrollWidth<=el.clientWidth)'
        ),
        true
      )
      await move(900, 80)
      fs.writeFileSync(
        path.join(output, `view-width-${value}.png`),
        (await win.webContents.capturePage()).toPNG()
      )
    }
    console.log('PASS: 180/360px form fields and totals fit at minimum Windows window size')
    await fill('#column-width', '315')
    await click('[aria-label="Nächstes Jahr"]')
    await move(454, 204)
    assert.equal(await hidden(), '0', 'year change must not leave Add visible')
    const year = await js('Number(document.querySelector(".selected-year").textContent)')
    fs.writeFileSync(
      path.join(profile, 'expected.json'),
      JSON.stringify({ cards: read().cards, year })
    )
    win.close()
  }
  require('../out/main/index.js')
}
