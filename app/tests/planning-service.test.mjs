import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, mkdir, rmdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { AppDataStore } from '../src/main/data-store.ts'
import { PlanningTransfer } from '../src/main/planning-transfer.ts'
import { createPlanningFile } from '../src/shared/planning-transfer.ts'

const card = {
  id: 'A',
  year: 2026,
  month: 0,
  order: 4,
  label: 'Kunde',
  title: 'Text',
  description: 'Details',
  minutesMin: 90,
  minutesMax: 1440,
  timeUnit: 'd',
  revenueMin: 0,
  revenueMax: 300,
  currency: 'CHF',
  expanded: false
}
const incoming = [
  { ...card, id: 'B', year: 2027, month: 11 },
  { ...card, id: 'C', timeUnit: 'm' }
]

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'capacity-transfer-test-'))
  t.after(async () => {
    assert.equal(dirname(directory), tmpdir())
    assert.ok(basename(directory).startsWith('capacity-transfer-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  const file = join(directory, 'data.json')
  const backup = join(directory, 'data.backup.json')
  const source = join(directory, 'import.json')
  const initial = { version: 2, cards: [card], window: { width: 1180, height: 760 } }
  await writeFile(file, JSON.stringify(initial))
  await writeFile(backup, 'previous backup bytes')
  await writeFile(source, JSON.stringify(createPlanningFile(incoming)))
  const store = new AppDataStore(file, initial)
  const transfer = new PlanningTransfer(store)
  return { directory, file, backup, source, initial, store, transfer }
}

test('preview and cancel do not write; confirmation uses staged bytes, preserves window and backs up original', async (t) => {
  const { file, backup, source, initial, transfer, store } = await fixture(t)
  const preview = await transfer.preview(source)
  assert.deepEqual(preview.years, [
    { year: 2026, count: 1 },
    { year: 2027, count: 1 }
  ])
  assert.equal(preview.existingCardCount, 1)
  assert.equal(await readFile(backup, 'utf8'), 'previous backup bytes')
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
  transfer.cancel()
  await assert.rejects(transfer.confirm(preview.token))
  const next = await transfer.preview(source)
  await writeFile(source, 'changed after preview')
  await transfer.confirm(next.token)
  assert.deepEqual(store.data, { ...initial, cards: incoming })
  assert.deepEqual(JSON.parse(await readFile(backup, 'utf8')), initial)
  await assert.rejects(transfer.confirm(next.token))
})

test('invalid files and stale previews cannot overwrite cards or backups', async (t) => {
  const { file, backup, source, transfer, store } = await fixture(t)
  for (const content of [
    '{broken',
    JSON.stringify({ formatVersion: 900 }),
    JSON.stringify({ ...createPlanningFile(incoming), cards: [card, card] })
  ]) {
    await writeFile(source, content)
    await assert.rejects(transfer.preview(source))
    assert.equal(await readFile(backup, 'utf8'), 'previous backup bytes')
  }
  await writeFile(source, JSON.stringify(createPlanningFile(incoming)))
  const preview = await transfer.preview(source)
  await store.save({ cards: [{ ...card, title: 'Changed' }] })
  const before = await readFile(file, 'utf8'),
    beforeBackup = await readFile(backup, 'utf8')
  await assert.rejects(transfer.confirm(preview.token), /inzwischen/)
  assert.equal(await readFile(file, 'utf8'), before)
  assert.equal(await readFile(backup, 'utf8'), beforeBackup)
})

test('write and backup staging errors preserve files and permit a fresh preview and retry', async (t) => {
  const { file, backup, source, initial, transfer } = await fixture(t)
  for (const blocked of [`${file}.tmp`, `${backup}.tmp`]) {
    await mkdir(blocked)
    const preview = await transfer.preview(source)
    await assert.rejects(transfer.confirm(preview.token))
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
    assert.equal(await readFile(backup, 'utf8'), 'previous backup bytes')
    await rmdir(blocked)
  }
  const retry = await transfer.preview(source)
  await transfer.confirm(retry.token)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).cards, incoming)
})

test('export round-trip and failed/protected export leave internal data and backup intact', async (t) => {
  const { directory, file, backup, initial, transfer } = await fixture(t)
  const output = join(directory, 'export.json')
  await transfer.export(output, [file, backup])
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), createPlanningFile(initial.cards))
  await assert.rejects(transfer.export(file, [file, backup]))
  await assert.rejects(transfer.export(directory, [file, backup]))
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
  assert.equal(await readFile(backup, 'utf8'), 'previous backup bytes')
  const preview = await transfer.preview(output)
  await transfer.confirm(preview.token)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
  assert.deepEqual(JSON.parse(await readFile(backup, 'utf8')), initial)
})

test('first replacement in an empty profile backs up the previous empty planning state', async (t) => {
  const { directory } = await fixture(t)
  const file = join(directory, 'empty.json')
  const store = new AppDataStore(file, { version: 2, cards: [] })
  await store.replacePlanning(incoming, '[]')
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'data.backup.json'), 'utf8')), {
    version: 2,
    cards: []
  })
})

test(
  'Windows sharing violation during final rename restores the previous backup',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { file, backup, source, initial, transfer } = await fixture(t)
    const lock = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$h=[IO.File]::Open($env:CAPACITY_TEST_LOCK,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); [Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null; $h.Dispose()"
      ],
      { env: { ...process.env, CAPACITY_TEST_LOCK: file }, windowsHide: true }
    )
    try {
      const [chunk] = await once(lock.stdout, 'data')
      assert.match(chunk.toString(), /READY/)
      const preview = await transfer.preview(source)
      await assert.rejects(transfer.confirm(preview.token))
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), initial)
      assert.equal(await readFile(backup, 'utf8'), 'previous backup bytes')
    } finally {
      const closed = once(lock, 'close')
      lock.stdin.end('\n')
      await closed
    }
    await transfer.confirm((await transfer.preview(source)).token)
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).cards, incoming)
  }
)
