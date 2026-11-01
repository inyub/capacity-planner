const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../out')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(output, 'time-profile-'))
  const cards = [
    {
      id: 'legacy',
      year: new Date().getFullYear(),
      month: 0,
      order: 7,
      label: 'Alte Kundin',
      title: 'Stundenkarte',
      description: 'Erhalten\nZweite Zeile',
      hoursMin: 10,
      hoursMax: 15,
      revenueMin: 150,
      revenueMax: 300,
      currency: 'CHF',
      expanded: false
    }
  ]
  const original = { version: 1, cards, window: { width: 1180, height: 760 } }
  fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify(original))
  fs.writeFileSync(path.join(profile, 'legacy.json'), JSON.stringify(original))
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
    for (const invalid of [
      JSON.stringify({ version: 999, cards }),
      JSON.stringify({ version: 1, cards: [{ ...cards[0], hoursMin: -1 }] }),
      '{invalid json'
    ]) {
      fs.writeFileSync(path.join(profile, 'data.json'), invalid)
      const backup = fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8')
      const result = spawnSync(require('electron'), [__filename, profile, 'rejected'], {
        env,
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true
      })
      assert.equal(result.status, 1, result.stderr)
      assert.ok(result.stdout.includes('PASS: loading refused'), result.stdout)
      assert.equal(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'), invalid)
      assert.equal(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8'), backup)
    }
    console.log(
      'PASS: unknown versions, invalid legacy times and malformed JSON never overwrite data or backup'
    )
    console.log('PASS: time migration, input, unit changes, mixed totals, edit and restart')
  } finally {
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('time-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
} else {
  const { app, dialog } = require('electron')
  const profile = process.argv[2]
  const phase = process.argv[3]
  app.setPath('userData', profile)
  if (phase === 'rejected') {
    dialog.showErrorBox = (title) => {
      assert.equal(title, 'Daten konnten nicht geladen werden')
      console.log('PASS: loading refused')
    }
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
    const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))
    const waitFor = async (code) => {
      for (let i = 0; i < 150; i++) {
        if (await js(code)) return
        await pause()
      }
      throw new Error(`Timed out: ${code}`)
    }
    const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const fill = async (name, value) => {
      await js(`(() => {
        const el = document.querySelector('[name=${name}]');
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
      })()`)
    }
    const data = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    const save = async () => {
      await click('.save-card')
      await waitFor('!document.querySelector(".card-form")')
    }
    const edit = async (id) => {
      await click(`[data-card-id="${id}"] .card-settings`)
      await waitFor('!!document.querySelector(".card-form")')
    }
    await waitFor('document.querySelector(".add-card")?.disabled === false')
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(profile, 'expected.json'), 'utf8'))
      assert.deepEqual(data().cards, expected.cards)
      assert.equal(data().version, 2)
      await edit(expected.cards.find((c) => c.title === 'Minute').id)
      assert.equal(await js('document.querySelector("[name=time]").value'), '90')
      assert.equal(await js('document.querySelector("[name=timeUnit]").value'), 'm')
      await click('.form-close')
      await edit('legacy')
      assert.equal(await js('document.querySelector("[name=timeUnit]").value'), 'h')
      assert.equal(await js('document.querySelector("[name=time]").value'), '10-15')
      await click('.form-close')
      assert.equal(
        await js('document.querySelector(".month-totals").children[0].textContent'),
        '1d 13h 1m – 2d 18h 1m'
      )
      console.log(
        'PASS: minutes, chosen units, legacy hours and mixed totals survive a new process'
      )
      win.close()
      return
    }
    assert.equal(
      await js('document.querySelector(".card-values").textContent'),
      '10-15 h150-300 CHF'
    )
    await edit('legacy')
    assert.equal(await js('document.querySelector("[name=time]").value'), '10-15')
    assert.equal(await js('document.querySelector("[name=timeUnit]").value'), 'h')
    await save()
    assert.equal(data().version, 2)
    const legacy = JSON.parse(fs.readFileSync(path.join(profile, 'legacy.json'), 'utf8'))
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8')),
      legacy
    )
    assert.deepEqual([data().cards[0].minutesMin, data().cards[0].minutesMax], [600, 900])
    assert.equal(data().cards[0].order, 7)
    assert.equal(data().cards[0].expanded, false)
    for (const [title, input, unit, min, max] of [
      ['Minute', '90m', 'm', 90, 90],
      ['Stunde', '1.5h', 'h', 90, 90],
      ['Tag', '1d', 'd', 1440, 1440],
      ['Bereich', '1-2d', 'd', 1440, 2880],
      ['Null', '0m', 'm', 0, 0],
      ['Rundung', '0.5m', 'm', 1, 1]
    ]) {
      await click('.add-card')
      await fill('label', 'Neue Kundin')
      await fill('title', title)
      await fill('revenue', '0.1-0.2')
      for (const invalid of ['-1', '2-1d', '1-2-3', '2w', 'Infinity', '1h-2d']) {
        await fill('time', invalid)
        assert.equal(await js('document.querySelector(".save-card").disabled'), true)
      }
      await fill('time', input)
      assert.equal(await js('document.querySelector("[name=timeUnit]").value'), unit)
      for (const other of ['d', 'h', 'm', unit]) await fill('timeUnit', other)
      await save()
      const created = data().cards.find((c) => c.title === title)
      assert.deepEqual([created.minutesMin, created.minutesMax, created.timeUnit], [min, max, unit])
      await edit(created.id)
      assert.equal(await js('document.querySelector("[name=timeUnit]").value'), unit)
      await save()
      assert.deepEqual(
        data().cards.find((c) => c.id === created.id),
        created
      )
    }
    assert.equal(
      await js('document.querySelector(".month-totals").children[0].textContent'),
      '2d 13h 1m – 3d 18h 1m'
    )
    // Remove the scalar day via the existing confirmation flow, preserving the day range.
    const day = data().cards.find((c) => c.title === 'Tag')
    await edit(day.id)
    await click('.delete-card')
    await click('.confirm-delete')
    await waitFor('!document.querySelector(".card-form")')
    for (const width of [180, 360]) {
      await js(`(() => {
        const el = document.querySelector('#column-width');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${width}');
        el.dispatchEvent(new Event('input',{bubbles:true}));
      })()`)
      await edit('legacy')
      win.setSize(960, 620)
      await pause()
      assert.equal(
        await js(`(() => {
        const form = document.querySelector('.card-form'), r = form.getBoundingClientRect();
        return form.scrollWidth <= form.clientWidth && [...form.querySelectorAll('input,select')]
          .every(el => {const b = el.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right});
      })()`),
        true
      )
      fs.writeFileSync(
        path.join(output, `time-form-${width}.png`),
        (await win.webContents.capturePage()).toPNG()
      )
      await click('.form-close')
    }
    fs.writeFileSync(path.join(profile, 'expected.json'), JSON.stringify(data()))
    console.log(
      'PASS: v1 backup, explicit hours migration, suffixes, invalid input, rounding, unit conversion, edit, delete and narrow/wide forms'
    )
    win.close()
  }
  require('../out/main/index.js')
}
