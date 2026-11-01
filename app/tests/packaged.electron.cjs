// Exercise the shipped executable, not the development Electron binary or a Vite server.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'out')
const executable = path.join(root, 'dist/win-unpacked/CapacityPlanner.exe')
const version = require('../package.json').version
const installer = path.join(root, `dist/Capacity-Planner-${version}-Setup.exe`)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function verifyPackage() {
  const asar = await import('@electron/asar')
  const archive = path.join(root, 'dist/win-unpacked/resources/app.asar')
  const files = asar
    .listPackage(archive)
    .map((name) => name.replaceAll('\\', '/').replace(/^\//, ''))
  for (const name of files) {
    assert.ok(
      name === 'package.json' ||
        name === 'out' ||
        ['out/main', 'out/preload', 'out/renderer', 'resources', 'node_modules'].some(
          (prefix) => name === prefix || name.startsWith(prefix + '/')
        ),
      `Unexpected packaged file: ${name}`
    )
  }
  assert.ok(files.includes('out/main/index.js'))
  assert.ok(files.includes('out/preload/index.js'))
  assert.ok(files.includes('out/renderer/index.html'))
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json').toString()).version, version)
  const yaml = require('js-yaml')
  const metadata = yaml.load(fs.readFileSync(path.join(root, 'dist/latest.yml'), 'utf8'))
  assert.equal(metadata.version, version)
  const updateFile = metadata.files.find((file) => file.url.endsWith('.exe'))
  assert.ok(updateFile)
  assert.equal(decodeURIComponent(updateFile.url), path.basename(installer))
  if (updateFile.size !== undefined) assert.equal(updateFile.size, fs.statSync(installer).size)
  assert.equal(
    updateFile.sha512,
    createHash('sha512').update(fs.readFileSync(installer)).digest('base64')
  )
  const feed = yaml.load(
    fs.readFileSync(path.join(root, 'dist/win-unpacked/resources/app-update.yml'), 'utf8')
  )
  const target = JSON.parse(
    fs.readFileSync(path.join(root, 'resources/release-target.json'), 'utf8')
  )
  assert.equal(feed.provider, 'github')
  assert.equal(feed.owner, target.owner || 'UPDATE_OWNER_NOT_CONFIGURED')
  assert.equal(feed.repo, target.repo || 'UPDATE_REPO_NOT_CONFIGURED')
  for (const name of files.filter((name) =>
    /^out\/(?:main|preload|renderer)\/.+\.(?:js|css|html)$/.test(name)
  )) {
    assert.equal(
      hash(asar.extractFile(archive, path.normalize(name))),
      hash(fs.readFileSync(path.join(root, name))),
      `Stale packaged runtime: ${name}`
    )
  }
  assert.equal(
    files.some(
      (name) =>
        /(?:^|\/)(?:tests|scripts|src|step\d-profile-[^/]+)(?:\/|$)/.test(name) &&
        !name.startsWith('node_modules/')
    ),
    false
  )
  const source = fs.readFileSync(path.join(root, '../appicon.png'))
  assert.equal(hash(asar.extractFile(archive, 'resources/icon.png')), hash(source))
  const ico = fs.readFileSync(path.join(root, 'build/icon.ico'))
  const frames = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + index * 16
    const start = ico.readUInt32LE(entry + 12)
    return ico.subarray(start, start + ico.readUInt32LE(entry + 8))
  })
  const { NtExecutable, NtExecutableResource } = require('resedit')
  for (const file of [executable, installer]) {
    const pe = NtExecutable.from(fs.readFileSync(file))
    const entries = NtExecutableResource.from(pe).entries.filter((entry) => entry.type === 3)
    assert.ok(
      entries.some((entry) => frames.some((frame) => frame.equals(Buffer.from(entry.bin)))),
      `Supplied icon missing in ${file}`
    )
  }
  console.log(
    'PASS: shipped files contain runtime only; supplied icon is embedded in app and NSIS installer'
  )

  // Extract and compare the installer's actual application payload without installing
  // into the user's account or changing registry entries and shortcuts.
  const extracted = fs.mkdtempSync(path.join(output, 'package-installer-'))
  try {
    const sevenZip = path.join(root, 'node_modules/electron-winstaller/vendor/7z.exe')
    let result = spawnSync(sevenZip, ['x', installer, `-o${extracted}`, '-y'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000
    })
    assert.equal(result.status, 0, result.stderr)
    const find = (directory) =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? find(path.join(directory, entry.name))
            : [path.join(directory, entry.name)]
        )
    const payload = find(extracted).find((file) => /app-(?:64|x64)\.7z$/.test(file))
    assert.ok(payload, 'NSIS x64 payload missing')
    const payloadDirectory = path.join(extracted, 'payload')
    result = spawnSync(sevenZip, ['x', payload, `-o${payloadDirectory}`, '-y'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(
      hash(fs.readFileSync(path.join(payloadDirectory, 'resources/app.asar'))),
      hash(fs.readFileSync(archive))
    )
    assert.equal(
      hash(fs.readFileSync(path.join(payloadDirectory, 'CapacityPlanner.exe'))),
      hash(fs.readFileSync(executable))
    )
    console.log('PASS: NSIS x64 payload exactly matches the tested executable and app.asar')
  } finally {
    assert.equal(path.dirname(extracted), output)
    assert.ok(path.basename(extracted).startsWith('package-installer-'))
    fs.rmSync(extracted, { recursive: true, force: true })
  }
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function launch(profile) {
  const port = await freePort()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const child = spawn(
    executable,
    [
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1'
    ],
    { cwd: path.dirname(executable), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.stdout.resume()
  const exited = new Promise((resolve) => {
    child.once('exit', (code) => resolve(code))
    child.once('error', (error) => resolve(error))
  })
  let target
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(`Packaged app exited early: ${stderr}`)
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'))
      if (target) break
    } catch {
      /* DevTools has not opened its local socket yet. */
    }
    await pause(50)
  }
  assert.ok(target, `Packaged renderer did not start: ${stderr}`)
  assert.ok(target.url.includes('app.asar/out/renderer/index.html'), target.url)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails)
    const entry = pending.get(message.id)
    if (entry) {
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    }
  })
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('CDP closed'))
    }
    pending.clear()
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 15000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  const js = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async (expression) => {
    for (let i = 0; i < 150; i++) {
      if (await js(expression)) return
      await pause(40)
    }
    throw new Error(`Timed out: ${expression}`)
  }
  await waitFor(
    'document.querySelectorAll(".month-column").length === 12 && !!window.capacityPlanner'
  )
  const close = async () => {
    await js('void window.capacityPlanner.closeApp()').catch(() => {})
    const code = await Promise.race([exited, pause(10000).then(() => 'timeout')])
    if (code === 'timeout') child.kill()
    socket.close()
    assert.equal(code, 0, `Packaged app did not exit cleanly: ${stderr}`)
    assert.deepEqual(exceptions, [])
  }
  return { js, send, waitFor, close, child, env }
}

async function exercise() {
  await verifyPackage()
  const profile = fs.mkdtempSync(path.join(output, 'package-profile-'))
  let current
  try {
    current = await launch(profile)
    const { js, send, waitFor } = current
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await pause(40)
    }
    const fill = async (name, value) => {
      await js(
        `(()=>{const el=document.querySelector('[name="${name}"]');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`
      )
      await pause(20)
    }
    const read = () => JSON.parse(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'))
    assert.deepEqual((await js('window.capacityPlanner.loadData()')).cards, [])
    assert.equal(await js('typeof require'), 'undefined')
    assert.equal((await js('window.capacityPlanner.getUpdateState()')).status, 'disabled')
    await js(
      '(async()=>{await window.capacityPlanner.checkForUpdates();await window.capacityPlanner.downloadUpdate();await window.capacityPlanner.installUpdate()})()'
    )
    await js(
      '(async()=>{await window.capacityPlanner.saveData(await window.capacityPlanner.loadData())})()'
    )
    assert.deepEqual(read().cards, [])
    const year = new Date().getFullYear()
    await click('[aria-label="Nächstes Jahr"]')
    assert.equal(await js('document.querySelector(".selected-year").textContent'), String(year + 1))
    await click('[aria-label="Vorheriges Jahr"]')
    await click('[data-month="0"] .add-card')
    await fill('label', 'Produktionsprüfung')
    await fill('title', 'Buchsatz')
    await fill('description', '300 Seiten\nOhne Kapitelzierden')
    await fill('time', '20-10')
    await fill('revenue', '150-300')
    assert.equal(await js('document.querySelector(".save-card").disabled'), true)
    await fill('time', '10-15h')
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    const id = read().cards[0].id
    await click('[data-month="0"] .add-card')
    await fill('label', 'Messe')
    await fill('title', 'CHF-Auftrag')
    await fill('time', '20h')
    await fill('revenue', '50')
    await fill('currency', 'CHF')
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(
      await js('document.querySelector(".month-totals").children[0].textContent'),
      '1d 6h 0m – 1d 11h 0m'
    )
    assert.deepEqual(
      await js(
        '[...document.querySelectorAll(".month-revenue")[0].children].map(el=>el.textContent.trim())'
      ),
      ['50 CHF', '150-300 EUR']
    )
    await click(`[data-card-id="${id}"] .card-settings`)
    await fill('title', 'Produktions-Buchsatz')
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    await click(`[data-card-id="${id}"] .description-toggle`)
    await pause(400)
    const secondId = read().cards.find((card) => card.id !== id).id
    await click(`[data-card-id="${secondId}"] .card-settings`)
    await click('.delete-card')
    await click('.dialog-cancel')
    assert.equal(await js('!!document.querySelector(".card-form")'), true)
    await click('.delete-card')
    await click('.confirm-delete')
    await waitFor('!document.querySelector(".card-form")')
    assert.equal(read().cards.length, 1)
    console.log(
      'PASS: packaged fresh-profile launch, sandbox/preload, year navigation, form validation, edit/delete, ranges and currencies'
    )

    const from = await js(
      `(()=>{const r=document.querySelector('[data-card-id="${id}"] .card-title').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`
    )
    const to = await js(
      `(()=>{const r=document.querySelector('[data-month="2"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`
    )
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from })
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...from,
      button: 'left',
      clickCount: 1
    })
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + 12,
      y: from.y + 3,
      button: 'left',
      buttons: 1
    })
    await waitFor('!!document.querySelector(".card-drag-overlay")')
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...to,
      button: 'left',
      buttons: 1
    })
    await pause(80)
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...to,
      button: 'left',
      clickCount: 1
    })
    await waitFor('!document.querySelector(".card-drag-overlay")')
    await pause(400)
    assert.equal(read().cards[0].month, 2)
    assert.equal(read().cards[0].order, 0)
    await click('.settings-open')
    await waitFor('!!document.querySelector(".settings-dialog[open]")')
    await waitFor('!!document.querySelector(".theme-manager:not([hidden])")')
    await js(
      `(() => { const el=document.querySelector('.theme-select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'dracula'); el.dispatchEvent(new Event('change',{bubbles:true})) })()`
    )
    await fill('color-card', '#334466')
    await click('.theme-save')
    await waitFor('!!document.querySelector(".theme-saved")')
    await click('.settings-close')
    assert.equal(read().appearance.activeId, 'dracula')
    await js(`(() => { const el=document.querySelector('#column-width');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'180');
      el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await waitFor('document.querySelector(".view-toolbar output").textContent === "180 px"')
    await click('[aria-label="Spaltenbreite zurücksetzen"]')
    await waitFor('document.querySelector(".view-toolbar output").textContent === "252 px"')
    await js(`(() => { const el=document.querySelector('#column-width');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'360');
      el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await waitFor('document.querySelector(".view-toolbar output").textContent === "360 px"')
    await click(`[data-card-id="${id}"] .card-settings`)
    assert.equal(await js('document.querySelector("[name=timeUnit]").value'), 'h')
    await fill('timeUnit', 'm')
    assert.equal(await js('document.querySelector("[name=time]").value'), '600-900')
    await fill('time', '1-2d')
    await click('.save-card')
    await waitFor('!document.querySelector(".card-form")')
    assert.deepEqual(
      [read().cards[0].minutesMin, read().cards[0].minutesMax, read().cards[0].timeUnit],
      [1440, 2880, 'd']
    )
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(2)')
    assert.equal(
      await js(
        '!!document.querySelector(".planning-import") && !!document.querySelector(".planning-export")'
      ),
      true
    )
    assert.equal(
      await js(
        `(async()=>{try{await window.capacityPlanner.confirmPlanning('not-a-preview');return false}catch{return true}})()`
      ),
      true
    )
    await click('.settings-close')
    console.log(
      'PASS: packaged settings navigation, width/reset, minute/day input and confirmation-token validation'
    )
    await click('.settings-open')
    await click('.settings-nav-item:nth-child(3)')
    await waitFor('!!document.querySelector(".update-check")')
    assert.equal(await js('document.querySelector(".update-check").disabled'), true)
    await click('.settings-close')
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(
      path.join(output, 'packaged-chat14.png'),
      Buffer.from(screenshot.data, 'base64')
    )
    await click('[aria-label="Nächstes Jahr"]')
    const duplicate = spawn(executable, [`--user-data-dir=${profile}`], {
      cwd: path.dirname(executable),
      env: current.env,
      windowsHide: true,
      stdio: 'ignore'
    })
    const duplicateExit = await Promise.race([
      new Promise((resolve) => duplicate.once('exit', resolve)),
      pause(5000).then(() => 'timeout')
    ])
    if (duplicateExit === 'timeout') duplicate.kill()
    assert.equal(duplicateExit, 0)
    assert.equal(await js('document.querySelector(".selected-year").textContent'), String(year + 1))
    console.log(
      'PASS: packaged cross-month drag/drop, edited theme, screenshot and single-instance lock'
    )
    await current.close()
    current = null
    const saved = read()
    assert.equal(saved.cards[0].title, 'Produktions-Buchsatz')
    assert.equal(saved.cards[0].expanded, false)
    assert.ok(fs.existsSync(path.join(profile, 'data.backup.json')))
    saved.window = { ...saved.window, width: 1000, height: 650 }
    fs.writeFileSync(path.join(profile, 'data.json'), JSON.stringify(saved))
    current = await launch(profile)
    assert.deepEqual((await current.js('window.capacityPlanner.loadData()')).cards, saved.cards)
    assert.equal(
      await current.js('document.querySelector(".selected-year").textContent'),
      String(year + 1)
    )
    assert.equal(
      await current.js('document.querySelector(".view-toolbar output").textContent'),
      '360 px'
    )
    await current.js(`document.querySelector('[aria-label="Vorheriges Jahr"]').click()`)
    await current.waitFor(
      `document.querySelector('[data-month="2"] [data-card-id]')?.dataset.cardId === ${JSON.stringify(id)}`
    )
    assert.deepEqual(
      await current.js(
        `(()=>{const el=document.querySelector('[data-card-id="${id}"] .card-values');return el.textContent})()`
      ),
      '1-2 d150-300 EUR'
    )
    assert.equal(
      await current.js(
        'getComputedStyle(document.documentElement).getPropertyValue("--card").trim()'
      ),
      '#334466'
    )
    assert.deepEqual(await current.js('({width:innerWidth,height:innerHeight})'), {
      width: 1000,
      height: 650
    })
    await current.close()
    current = null
    console.log(
      'PASS: packaged restart restores minute/day ranges, order/month, expansion, customized theme, year, width and normal window size'
    )
    const legacyCards = [
      {
        id: 'legacy-hours',
        year,
        month: 0,
        order: 7,
        label: 'Alte Kundin',
        title: 'Stundenauftrag',
        description: 'Originalbeschreibung\nZweite Zeile',
        hoursMin: 10,
        hoursMax: 15,
        revenueMin: 150.5,
        revenueMax: 300,
        currency: 'CHF',
        expanded: false
      },
      {
        id: 'legacy-next-year',
        year: year + 1,
        month: 11,
        order: 2,
        label: 'Messe',
        title: 'Alte Tagesdauer',
        description: '',
        hoursMin: 0.075,
        hoursMax: 24,
        revenueMin: 0,
        revenueMax: 0,
        currency: 'EUR',
        expanded: true
      }
    ]
    const legacy = { ...saved, version: 1, cards: legacyCards }
    const legacyBytes = JSON.stringify(legacy, null, 2)
    fs.writeFileSync(path.join(profile, 'data.json'), legacyBytes)
    current = await launch(profile)
    const migrated = await current.js('window.capacityPlanner.loadData()')
    assert.deepEqual(
      migrated.cards,
      legacyCards.map(({ hoursMin, hoursMax, ...rest }) => ({
        ...rest,
        minutesMin: hoursMin === 0.075 ? 5 : hoursMin * 60,
        minutesMax: hoursMax * 60,
        timeUnit: 'h'
      }))
    )
    assert.deepEqual(migrated.appearance, legacy.appearance)
    await current.js(
      '(async()=>await window.capacityPlanner.saveData(await window.capacityPlanner.loadData()))()'
    )
    assert.equal(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8'), legacyBytes)
    assert.equal(read().version, 2)
    await current.close()
    current = null
    const migratedBytes = fs.readFileSync(path.join(profile, 'data.json'), 'utf8')
    current = await launch(profile)
    assert.deepEqual((await current.js('window.capacityPlanner.loadData()')).cards, migrated.cards)
    await current.close()
    current = null
    assert.equal(fs.readFileSync(path.join(profile, 'data.json'), 'utf8'), migratedBytes)
    assert.equal(fs.readFileSync(path.join(profile, 'data.backup.json'), 'utf8'), legacyBytes)
    console.log(
      'PASS: packaged v1 HOURS migration over two years, exact original backup, metadata/theme retention and idempotent restart'
    )
    const report = {
      version,
      executable: path.relative(root, executable),
      installer: path.relative(root, installer),
      installerBytes: fs.statSync(installer).size,
      installerSha256: hash(fs.readFileSync(installer)),
      result: 'passed',
      platform: process.platform,
      architecture: process.arch,
      cleanProfile: true,
      checks: [
        'runtime matches current build',
        'GitHub manifest version/size/SHA-512 and configured feed',
        'uninstalled/isolated update gate and disabled update IPC',
        'NSIS payload matches tested app',
        'supplied icon',
        'sandbox/preload boundaries',
        'forms and currencies',
        'drag/drop',
        'themes',
        'settings/width/reset/year',
        'minutes and days',
        'single instance',
        'version 1 hours migration over two years',
        'exact original backup',
        'restart/idempotence'
      ]
    }
    fs.writeFileSync(
      path.join(output, 'packaged-verification.json'),
      JSON.stringify(report, null, 2)
    )
  } finally {
    if (current) {
      await current.close().catch(() => current.child.kill())
    }
    assert.equal(path.dirname(profile), output)
    assert.ok(path.basename(profile).startsWith('package-profile-'))
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

exercise().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
