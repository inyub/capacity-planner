import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, readFile, mkdir, rmdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { AppDataStore } from '../src/main/data-store.ts'

async function fixture(t, delay = 300) {
  const directory = await mkdtemp(join(tmpdir(), 'capacity-store-test-'))
  t.after(async () => {
    assert.equal(dirname(directory), tmpdir())
    assert.ok(basename(directory).startsWith('capacity-store-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  const file = join(directory, 'data.json')
  const initial = { version: 1, cards: [] }
  await writeFile(file, JSON.stringify(initial))
  return { directory, file, initial, store: new AppDataStore(file, initial, delay) }
}

test('300 ms debounce coalesces changes and acknowledges only after durable save', async (t) => {
  const { file, directory, initial, store } = await fixture(t)
  let acknowledged = false
  const first = store.save({ cards: [{ id: 'first' }] }).then(() => {
    acknowledged = true
  })
  await pause(100)
  const last = store.save({ cards: [{ id: 'latest' }] })
  const bounds = store.save({ window: { width: 1000, height: 650, x: 40, y: 50 } })
  await pause(100)
  assert.equal(acknowledged, false)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
  await Promise.all([first, last, bounds])
  assert.equal(acknowledged, true)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
    version: 1,
    cards: [{ id: 'latest' }],
    window: { width: 1000, height: 650, x: 40, y: 50 }
  })
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'data.backup.json'), 'utf8')), initial)
  assert.equal((await readdir(directory)).includes('data.json.tmp'), false)
})

test('flush saves immediately, serializes overlapping writes and preserves latest bounds and cards', async (t) => {
  const { store, file, directory, initial } = await fixture(t, 60_000)
  const first = store.save({ cards: [{ id: 'A' }] })
  const flushA = store.flush()
  const second = store.save({ cards: [{ id: 'B' }] })
  const bounds = store.save({ window: { width: 1180, height: 760 } })
  const flushB = store.flush()
  await Promise.all([first, second, bounds, flushA, flushB])
  const persisted = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(persisted.cards, [{ id: 'B' }])
  assert.equal(persisted.window.width, 1180)
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'data.backup.json'), 'utf8')), {
    ...initial,
    cards: [{ id: 'A' }]
  })
  assert.deepEqual(store.data, persisted)
  // A no-op must not overwrite the useful previous backup.
  const backup = await readFile(join(directory, 'data.backup.json'), 'utf8')
  const unchanged = store.save({ cards: persisted.cards })
  await store.flush()
  await unchanged
  assert.equal(await readFile(join(directory, 'data.backup.json'), 'utf8'), backup)
})

test('failed atomic write preserves previous data, rejects all waiters and allows retry', async (t) => {
  const { store, file, initial } = await fixture(t, 60_000)
  await mkdir(`${file}.tmp`)
  const failed = store.save({ cards: [{ id: 'do-not-commit' }] })
  const rejected = assert.rejects(failed)
  await assert.rejects(store.flush())
  await rejected
  assert.deepEqual(store.data, initial)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
  await rmdir(`${file}.tmp`)
  const bounds = store.save({ window: { width: 960, height: 620 } })
  await store.flush()
  await bounds
  assert.deepEqual(store.data.cards, [])
  const retry = store.save({ cards: [{ id: 'retry' }] })
  await store.flush()
  await retry
  assert.deepEqual(store.data.cards, [{ id: 'retry' }])
})

test('first save creates a new data directory without requiring an existing backup', async (t) => {
  const { directory, initial } = await fixture(t)
  const file = join(directory, 'new-profile', 'data.json')
  const store = new AppDataStore(file, initial)
  const pending = store.save({ window: { width: 960, height: 620 } })
  await store.flush()
  await pending
  assert.equal(JSON.parse(await readFile(file, 'utf8')).window.width, 960)
  assert.deepEqual(await readdir(dirname(file)), ['data.json'])
})

test('migration writes version 2 even for unchanged data, backs up version 1 and retries failures', async (t) => {
  const { file, directory, initial } = await fixture(t)
  const migrated = { ...initial, version: 2 }
  const store = new AppDataStore(file, migrated, 60_000, true)
  await mkdir(`${file}.tmp`)
  const failed = store.save({ cards: [] })
  const rejected = assert.rejects(failed)
  await assert.rejects(store.flush())
  await rejected
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
  await rmdir(`${file}.tmp`)
  const retry = store.save({ cards: [] })
  await store.flush()
  await retry
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), migrated)
  const backup = await readFile(join(directory, 'data.backup.json'), 'utf8')
  assert.deepEqual(JSON.parse(backup), initial)
  const unchanged = store.save({ cards: [] })
  await store.flush()
  await unchanged
  assert.equal(await readFile(join(directory, 'data.backup.json'), 'utf8'), backup)
})
