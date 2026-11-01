import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  activeTheme,
  COLOR_FIELDS,
  addMissingPresetThemes,
  defaultThemeState,
  isThemeState,
  upgradePresetThemes
} from '../src/shared/themes.ts'
import { AppDataStore } from '../src/main/data-store.ts'

test('eleven complete presets, Nebula default palette and independent editable copies', () => {
  const state = defaultThemeState()
  assert.equal(isThemeState(state), true)
  assert.deepEqual(
    state.themes.map((t) => t.name),
    [
      'Bernstein',
      'Zitrus',
      'Lagune',
      'Nachtflieder',
      'Tiefwald',
      'Nebula',
      'Karmin',
      'Dämmerung',
      'Napper',
      'Erdgold',
      'Cyberpunk Neon'
    ]
  )
  assert.equal(COLOR_FIELDS.length, 19)
  assert.equal(activeTheme().colors.header, '#252332')
  assert.equal(activeTheme(state).colors.card, '#3d375a')
  state.themes[5].colors.card = '#123456'
  assert.equal(activeTheme(defaultThemeState()).colors.card, '#3d375a')
})

test('invalid colors, missing tokens, duplicate ids, unknown presets and invalid selections are rejected', () => {
  for (const mutate of [
    (s) => {
      s.themes[0].colors.header = 'url(https://example.com)'
    },
    (s) => {
      delete s.themes[0].colors.text
    },
    (s) => {
      s.themes[0].colors.extra = '#123456'
    },
    (s) => {
      s.themes[0].id = s.themes[1].id
    },
    (s) => {
      s.activeId = 'missing'
    },
    (s) => {
      s.themes[0].name = '  '
    },
    (s) => {
      s.themes[0].name = 'a'.repeat(65)
    },
    (s) => {
      s.themes[0].baseId = 'missing'
    },
    (s) => {
      s.themes = []
    },
    (s) => {
      s.themes[0] = null
    }
  ]) {
    const state = defaultThemeState()
    mutate(state)
    assert.equal(isThemeState(state), false)
  }
  for (const value of [undefined, null, false, [], {}, { themes: 'wrong' }])
    assert.equal(isThemeState(value), false)
})

test('themes coalesce with card/window saves, survive later writes and restore from disk', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'capacity-theme-test-'))
  t.after(async () => {
    assert.equal(dirname(directory), tmpdir())
    assert.ok(basename(directory).startsWith('capacity-theme-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  const file = join(directory, 'data.json')
  const store = new AppDataStore(file, { version: 1, cards: [] }, 60000)
  const appearance = defaultThemeState()
  appearance.activeId = 'dracula'
  const writes = [
    store.save({ appearance }),
    store.save({ cards: [{ id: 'A' }] }),
    store.save({ window: { width: 1000, height: 650 } })
  ]
  await store.flush()
  await Promise.all(writes)
  const persisted = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(persisted.appearance, appearance)
  assert.equal(persisted.cards[0].id, 'A')
  assert.equal(persisted.window.width, 1000)
  const cards = store.save({ cards: [{ id: 'B' }] })
  await store.flush()
  await cards
  const restored = new AppDataStore(file, JSON.parse(await readFile(file, 'utf8')))
  assert.deepEqual(restored.data.appearance, appearance)
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, 'data.backup.json'), 'utf8')),
    persisted
  )
})

test('presets missing from saved state are appended once, existing themes stay untouched', () => {
  const state = defaultThemeState()
  state.themes = state.themes.slice(0, 8)
  state.themes[1].colors.card = '#123456'
  const added = addMissingPresetThemes(state)
  assert.equal(isThemeState(added), true)
  assert.deepEqual(
    added.themes.map((t) => t.name),
    [
      'Bernstein',
      'Zitrus',
      'Lagune',
      'Nachtflieder',
      'Tiefwald',
      'Nebula',
      'Karmin',
      'Dämmerung',
      'Napper',
      'Erdgold',
      'Cyberpunk Neon'
    ]
  )
  assert.equal(added.themes[1].colors.card, '#123456')
  assert.equal(addMissingPresetThemes(added), added)
})

test('saved copies of the former presets get new names; edited themes keep their colors', () => {
  const state = defaultThemeState()
  const blender = state.themes[0]
  blender.name = 'Blender'
  blender.colors = { ...blender.colors, header: '#303030', card: '#484848' }
  const custom = state.themes[1]
  custom.name = 'Mein Grün'
  custom.colors = { ...custom.colors, card: '#123456' }
  const upgraded = upgradePresetThemes(state)
  assert.equal(isThemeState(upgraded), true)
  assert.equal(upgraded.themes[0].name, 'Bernstein')
  assert.equal(upgraded.themes[1].name, 'Mein Grün')
  assert.equal(upgraded.themes[1].colors.card, '#123456')
  assert.equal(upgradePresetThemes(upgraded), upgraded)
})
