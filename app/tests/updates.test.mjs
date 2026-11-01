import assert from 'node:assert/strict'
import test from 'node:test'
import { readReleaseTarget, updateDisabledReason } from '../src/shared/update-target.ts'
import { UpdateController } from '../src/main/update-controller.ts'
import { AppDataStore } from '../src/main/data-store.ts'
import { mkdtemp, writeFile, readFile, rm, mkdir, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function fixture(options = {}) {
  const events = [],
    calls = []
  let onError
  const backend = {
    check: async () => {
      calls.push('check')
      return { available: true, version: '0.3.1' }
    },
    download: async (progress) => {
      calls.push('download')
      progress({ percent: 52, total: 1000, transferred: 520 })
    },
    cancel: () => calls.push('cancel'),
    install: () => calls.push('install'),
    onError: (callback) => {
      onError = callback
    },
    ...options.backend
  }
  const controller = new UpdateController({
    version: '0.3.0',
    disabledReason: null,
    notify: (state) => events.push(state),
    prepare: async () => {
      calls.push('flush')
    },
    installFailed: () => calls.push('reset-quit'),
    ...options,
    backend
  })
  return { controller, backend, events, calls, emitError: (error) => onError(error) }
}

test('release targets and installed-only gate reject placeholders, development and isolated profiles', () => {
  assert.equal(readReleaseTarget({ owner: '', repo: '' }), null)
  assert.deepEqual(readReleaseTarget({ owner: 'test-owner', repo: 'capacity-planner' }), {
    owner: 'test-owner',
    repo: 'capacity-planner'
  })
  for (const value of [
    null,
    {},
    { owner: 'a', repo: '' },
    { owner: '../a', repo: 'b' },
    { owner: 'a', repo: 'https://github.com/a/b' },
    { owner: 'UPDATE_OWNER_NOT_CONFIGURED', repo: 'UPDATE_REPO_NOT_CONFIGURED' }
  ])
    assert.throws(() => readReleaseTarget(value))
  const enabled = {
    platform: 'win32',
    packaged: true,
    installed: true,
    isolated: false,
    target: { owner: 'a', repo: 'b' }
  }
  assert.equal(updateDisabledReason(enabled), null)
  for (const disabled of [
    { platform: 'linux' },
    { packaged: false },
    { installed: false },
    { isolated: true },
    { target: null }
  ])
    assert.equal(typeof updateDisabledReason({ ...enabled, ...disabled }), 'string')
})

test('local Windows build wrapper rejects publishing overrides before starting builder', () => {
  const script = fileURLToPath(new URL('../scripts/build-windows.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, '--publish', 'always'], {
    encoding: 'utf8',
    windowsHide: true
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Dieser Build veröffentlicht niemals Dateien/)
})

test('no startup check; explicit check, progress, durable-save gate and manual install are ordered', async () => {
  const { controller, events, calls } = fixture()
  assert.equal(controller.snapshot.status, 'idle')
  assert.deepEqual(calls, [])
  await controller.download()
  await controller.install()
  assert.deepEqual(calls, [])
  await controller.check()
  assert.equal(controller.snapshot.status, 'available')
  await controller.download()
  assert.deepEqual(calls, ['check', 'download', 'flush', 'install'])
  assert.ok(events.some((s) => s.status === 'downloading' && s.percent === 52))
  assert.equal(controller.snapshot.status, 'installing')
  await controller.check()
  await controller.download()
  await controller.install()
  assert.deepEqual(calls, ['check', 'download', 'flush', 'install'])
})

test('disabled and concurrent checks do not start duplicate backend requests', async () => {
  const pending = deferred()
  const { controller, calls } = fixture({
    backend: {
      check: async () => {
        calls.push('check')
        return pending.promise
      }
    }
  })
  const first = controller.check()
  await controller.check()
  await controller.download()
  await controller.install()
  assert.deepEqual(calls, ['check'])
  pending.resolve({ available: false, version: '0.3.0' })
  await first
  assert.equal(controller.snapshot.status, 'current')
  const disabled = fixture({ disabledReason: 'Nicht eingerichtet' })
  await disabled.controller.check()
  await disabled.controller.download()
  await disabled.controller.install()
  assert.deepEqual(disabled.calls, [])
})

test('cancellation blocks installation even when a late download resolves and permits retry', async () => {
  const pending = deferred()
  const { controller, calls, backend } = fixture({
    backend: {
      download: async () => {
        calls.push('download')
        await pending.promise
      }
    }
  })
  await controller.check()
  const download = controller.download()
  controller.cancel()
  await controller.download()
  pending.resolve()
  await download
  assert.equal(controller.snapshot.status, 'available')
  assert.deepEqual(calls, ['check', 'download', 'cancel'])
  backend.download = async () => {}
  await controller.download()
  assert.deepEqual(calls.slice(-2), ['flush', 'install'])
})

test('network and integrity errors never install; stale progress cannot overwrite error state', async () => {
  let fail = true
  const { controller, calls, backend, emitError } = fixture({
    backend: {
      check: async () => {
        if (fail) throw new Error('offline')
        return { available: true, version: '0.3.1' }
      }
    }
  })
  await controller.check()
  assert.equal(controller.snapshot.status, 'error')
  fail = false
  await controller.check()
  backend.download = async (progress) => {
    emitError(new Error('hash mismatch'))
    progress({ percent: 100, total: 10, transferred: 10 })
    throw new Error('hash mismatch')
  }
  await controller.download()
  assert.equal(controller.snapshot.status, 'error')
  assert.equal(calls.includes('install'), false)
})

test('failed persistence preserves data and backup and keeps download ready for retry', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'capacity-update-test-'))
  t.after(async () => {
    assert.equal(dirname(directory), tmpdir())
    assert.ok(basename(directory).startsWith('capacity-update-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  const file = join(directory, 'data.json'),
    backup = join(directory, 'data.backup.json')
  const initial = { version: 2, cards: [] }
  await writeFile(file, JSON.stringify(initial))
  await writeFile(backup, 'KEEP BACKUP')
  const store = new AppDataStore(file, initial, 60000)
  await mkdir(`${file}.tmp`)
  const save = store.save({ window: { width: 1000, height: 650 } })
  const rejected = assert.rejects(save)
  const { controller, calls } = fixture({ prepare: () => store.flush() })
  await controller.check()
  await controller.download()
  await rejected
  assert.equal(controller.snapshot.status, 'downloaded')
  assert.equal(calls.includes('install'), false)
  assert.equal(await readFile(file, 'utf8'), JSON.stringify(initial))
  assert.equal(await readFile(backup, 'utf8'), 'KEEP BACKUP')
  await rmdir(`${file}.tmp`)
  const retry = store.save({ window: { width: 1000, height: 650 } })
  await controller.install()
  await retry
  assert.equal(controller.snapshot.status, 'installing')
  assert.equal(calls.at(-1), 'install')
})

test('asynchronous installer errors unlock quit state and show an error', async () => {
  const { controller, calls, emitError } = fixture()
  await controller.check()
  await controller.download()
  emitError(new Error('cannot spawn'))
  assert.equal(controller.snapshot.status, 'error')
  assert.equal(calls.at(-1), 'reset-quit')
})
