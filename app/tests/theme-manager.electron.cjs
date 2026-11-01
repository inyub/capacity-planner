const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'step7-profile-'))
  const manual = process.argv.includes('--manual')
  const year = new Date().getFullYear()
  const cards = Array.from({ length: 14 }, (_, order) => ({
    id: `Card-${order}`,
    year,
    month: order < 10 ? 0 : 1,
    order,
    label: 'Auftraggeber / Messe',
    title: order === 0 ? 'Buchsatz' : `Projekt ${order + 1}`,
    description: '300 Seiten\nOhne Kapitelzierden',
    hoursMin: 10,
    hoursMax: 15,
    revenueMin: 150,
    revenueMax: 300,
    currency: order % 2 ? 'CHF' : 'EUR',
    expanded: order % 2 === 0
  }))
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify({ version: 1, cards }))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    for (const phase of manual ? ['manual'] : ['initial', 'restart', 'recovery']) {
      if (phase === 'recovery') {
        const data = JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
        data.appearance.themes[0].colors.header = 'broken'
        fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify(data))
      }
      const result = spawnSync(require('electron'), [__filename, profile, phase], {
        env,
        encoding: 'utf8',
        timeout: manual ? 600000 : 120000,
        windowsHide: !manual
      })
      console.log(result.stdout)
      if (result.status !== 0)
        throw new Error(
          `status=${result.status}, signal=${result.signal}, error=${result.error ?? 'none'}\n${result.stderr}`
        )
    }
    console.log(
      'PASS: Windows Electron Theme Manager, persistence and legacy/corrupt theme recovery'
    )
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('step7-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app, Menu } = require('electron')
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
      await js(
        `(() => { const el=document.querySelector('[name="${name}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`
      )
      await pause()
    }
    const key = async (keyCode, modifiers = []) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      await pause()
    }
    const read = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    const css = (name) =>
      js(`getComputedStyle(document.documentElement).getPropertyValue('--${name}').trim()`)
    const open = async () => {
      if (!(await js('!!document.querySelector(".settings-dialog[open]")'))) {
        await js('document.querySelector(".settings-open").focus()')
        await click('.settings-open')
        await waitFor('!!document.querySelector(".settings-dialog[open]")')
      }
      await click('.settings-theme-edit')
      await waitFor('!!document.querySelector(".theme-dialog[open]")')
    }
    const save = async () => {
      await click('.theme-save')
      await waitFor('!document.querySelector(".theme-dialog")')
      await pause(50)
    }
    const select = (id) => click(`[data-theme-id="${id}"]`)
    await waitFor('document.querySelectorAll("[data-card-id]").length === 14')
    win.focus()
    if (phase === 'manual') {
      win.setTitle('Capacity Planner · Theme-Test')
      setTimeout(() => {
        win.show()
        win.focus()
      }, 100)
      console.log('Isolated manual theme test ready')
      return
    }
    if (phase === 'recovery') {
      assert.equal(await css('header'), '#302848')
      assert.equal(await js('document.querySelectorAll("[data-card-id]").length'), 14)
      assert.equal(
        await js('document.querySelector("[data-card-id=Card-0] .card-title").textContent'),
        'Buchsatz'
      )
      await open()
      assert.equal(await js('document.querySelectorAll(".theme-preset").length'), 8)
      console.log('PASS: damaged appearance falls back to Space without losing planning data')
      win.close()
      return
    }
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(profile, 'expected.json'), 'utf8'))
      assert.deepEqual(read().cards, expected.cards)
      assert.deepEqual(read().appearance, expected.appearance)
      assert.equal(await css('header'), '#402633')
      await open()
      assert.equal(await js('document.querySelectorAll(".theme-preset").length'), 8)
      assert.equal(await js('!!document.querySelector("[data-theme-id=fl-studio]")'), false)
      assert.equal(
        await js(
          '[...document.querySelectorAll(".theme-preset")].some(el=>el.textContent.includes("Mein Theme"))'
        ),
        true
      )
      console.log(
        'PASS: active palette, custom colors/names and deletion restored in a new process'
      )
      win.close()
      return
    }

    assert.equal(await css('header'), '#302848')
    assert.equal(read().appearance, undefined)
    let menus = 0
    // Verify native Windows non-client wiring without blocking the automated test in a popup.
    Menu.prototype.popup = function () {
      assert.equal(this.items[0].label, 'Einstellungen')
      menus++
      this.items[0].click()
    }
    let prevented = false
    win.emit(
      'system-context-menu',
      {
        preventDefault: () => {
          prevented = true
        }
      },
      { x: 100, y: 30 }
    )
    await waitFor('!!document.querySelector(".settings-dialog[open]")')
    await click('.settings-theme-edit')
    await waitFor('!!document.querySelector(".theme-dialog[open]")')
    assert.equal(prevented, true)
    assert.equal(menus, 1)
    assert.equal(await js('document.querySelectorAll(".theme-preset").length'), 8)
    await select('blender')
    assert.equal(await css('header'), '#303030')
    assert.equal(read().appearance, undefined)
    await fill('color-card', '#123456')
    assert.equal(await css('card'), '#123456')
    await fill('color-card', '#oops')
    assert.equal(await js('document.querySelector(".theme-save").disabled'), true)
    await key('Escape')
    await waitFor('!document.querySelector(".theme-dialog")')
    assert.equal(await css('header'), '#302848')
    assert.equal(await css('card'), '#4c456d')
    assert.equal(read().appearance, undefined)
    await key('Escape')
    await waitFor('!document.querySelector(".settings-dialog")')
    await js(
      'document.querySelector(".planner-header").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))'
    )
    await waitFor('!!document.querySelector(".settings-dialog[open]")')
    await click('.settings-theme-edit')
    await waitFor('!!document.querySelector(".theme-dialog[open]")')
    assert.equal(menus, 2)
    for (const id of [
      'blender',
      'fl-studio',
      'maya',
      'obsidian',
      'dark-emerald',
      'space',
      'crimson',
      'dracula'
    ]) {
      await select(id)
      assert.equal(
        await js(
          '[...document.querySelectorAll(".theme-preview .planner-card, .month-column")].every(el=>getComputedStyle(el).backgroundImage.includes("linear-gradient"))'
        ),
        true
      )
    }
    console.log(
      'PASS: legacy default, native/renderer header menu, eight themes, live colors/gradients, validation and cancel rollback'
    )

    await select('space')
    await fill('color-card', '#123456')
    await click('.theme-reset')
    assert.equal(await css('card'), '#4c456d')
    await click('.theme-duplicate')
    const customId = await js(
      'document.querySelector(".theme-preset[aria-pressed=true]").dataset.themeId'
    )
    assert.match(customId, /^[a-f0-9-]{36}$/)
    await fill('theme-name', 'Mein Theme')
    await fill('color-card', '#123456')
    await save()
    assert.equal(read().appearance.activeId, customId)
    assert.equal(read().appearance.themes.length, 9)
    assert.equal(await css('card'), '#123456')
    assert.equal(await js('document.activeElement.classList.contains("settings-theme-edit")'), true)
    await open()
    await click('.theme-reset')
    assert.equal(await css('card'), '#4c456d')
    await key('Escape')
    assert.equal(await css('card'), '#123456')
    await open()
    await select('fl-studio')
    await click('.theme-delete')
    await waitFor('!!document.querySelector(".theme-delete-dialog[open]")')
    await key('Escape')
    assert.equal(await js('!!document.querySelector(".theme-dialog[open]")'), true)
    assert.equal(await js('!!document.querySelector(".theme-delete-dialog[open]")'), false)
    await click('.theme-delete')
    await click('.theme-delete-dialog .confirm-delete')
    assert.equal(await js('!!document.querySelector("[data-theme-id=fl-studio]")'), false)
    assert.equal(read().appearance.themes.length, 9)
    await select(customId)
    await save()
    assert.equal(read().appearance.themes.length, 8)
    assert.equal(
      read().appearance.themes.some((t) => t.id === 'fl-studio'),
      false
    )
    console.log(
      'PASS: duplicate/name/color save, reset/cancel, focus restoration, confirmed deletion and nested Escape'
    )

    fs.mkdirSync(path.join(profile, 'data.json.tmp'))
    await open()
    await select('crimson')
    await click('.theme-save')
    await waitFor('!!document.querySelector(".theme-actions [role=alert]")')
    assert.equal(read().appearance.activeId, customId)
    assert.equal(await css('header'), '#402633')
    fs.rmdirSync(path.join(profile, 'data.json.tmp'))
    await key('Escape')
    assert.equal(await css('card'), '#123456')
    await open()
    await select('crimson')
    await save()
    assert.equal(read().appearance.activeId, 'crimson')
    assert.equal(await css('header'), '#402633')
    await click('[data-card-id=Card-0] .description-toggle')
    await pause(400)
    assert.equal(read().appearance.activeId, 'crimson')
    for (const corrupt of ['missing', 'color', 'duplicates']) {
      assert.equal(
        await js(
          `(async()=>{const data=await window.capacityPlanner.loadData(); ${corrupt === 'missing' ? 'data.appearance.activeId="missing";' : corrupt === 'color' ? 'data.appearance.themes[0].colors.card="url(example)";' : 'data.appearance.themes[1].id=data.appearance.themes[0].id;'} try {await window.capacityPlanner.saveData(data);return false;}catch{return true;}})()`
        ),
        true
      )
    }
    console.log(
      'PASS: real failed save retains draft and durable data; retry succeeds; card saves preserve themes; invalid IPC rejected'
    )

    await key('Escape')
    await waitFor('!document.querySelector(".settings-dialog")')
    await js('document.querySelector(".settings-open").focus()')
    await key(',', ['control'])
    await waitFor('!!document.querySelector(".theme-dialog[open]")')
    await js('document.querySelector(".theme-save").focus()')
    await key('Tab')
    assert.equal(await js('!!document.activeElement.closest(".theme-dialog")'), true)
    await key('Enter', ['control'])
    await waitFor('!document.querySelector(".theme-dialog")')
    win.setSize(960, 620)
    await pause(400)
    await open()
    assert.equal(
      await js(
        `(()=>{const d=document.querySelector('.theme-dialog').getBoundingClientRect();return d.top>=0&&d.left>=0&&d.bottom<=innerHeight&&d.right<=innerWidth})()`
      ),
      true
    )
    assert.equal(
      await js(
        'document.querySelector(".theme-editor").scrollHeight > document.querySelector(".theme-editor").clientHeight'
      ),
      true
    )
    fs.writeFileSync(
      path.join(output, 'theme-manager-step7.png'),
      (await win.webContents.capturePage()).toPNG()
    )
    await key('Escape')
    fs.writeFileSync(path.join(profile, 'expected.json'), JSON.stringify(read()))
    assert.equal(read().cards.length, 14)
    assert.equal(read().version, 2)
    console.log(
      'PASS: Ctrl+, / Ctrl+Enter, focus containment, minimum size and scrollable editor; screenshot saved'
    )
    win.close()
  }
  require('../out/main/index.js')
}
