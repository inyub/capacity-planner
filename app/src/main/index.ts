import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { AppData, WindowBounds } from '../shared/types'
import { AppDataStore } from './data-store'
import { isAppData, migrateAppData } from '../shared/migration'
import { PlanningTransfer } from './planning-transfer'
import { UpdateController } from './update-controller'
import { createUpdateBackend } from './update-backend'
import { readReleaseTarget, updateDisabledReason } from '../shared/update-target'

const DATA_VERSION = 2 as const
const DEFAULT_WIDTH = 1180
const DEFAULT_HEIGHT = 760
const MIN_WIDTH = 960
const MIN_HEIGHT = 620

// Keep the development data location when installed. Explicit Chromium profiles also
// allow a packaged build to be tested without reading or changing real planning data.
const profile = app.commandLine.getSwitchValue('user-data-dir')
if (profile || app.isPackaged) {
  const directory = profile ? resolve(profile) : join(app.getPath('appData'), 'capacity-planner')
  mkdirSync(directory, { recursive: true })
  app.setPath('userData', directory)
}
if (app.isPackaged && !app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
})

let mainWindow: BrowserWindow | null = null
let store: AppDataStore
let transfer: PlanningTransfer
let updates: UpdateController
let transferBusy = false
let quitAfterSave = false
let quitting = false

async function loadAppData(): Promise<{ data: AppData; migrated: boolean }> {
  const dataFile = join(app.getPath('userData'), 'data.json')
  try {
    const parsed: unknown = JSON.parse(await readFile(dataFile, 'utf8'))
    const migrated = migrateAppData(parsed)
    if (migrated) return { data: migrated, migrated: (parsed as { version: number }).version === 1 }
    // A damaged theme must never hide otherwise valid planning data.
    if (parsed && typeof parsed === 'object') {
      const recovered = { ...parsed } as Record<string, unknown>
      delete recovered.appearance
      const migrated = migrateAppData(recovered)
      if (migrated) return { data: migrated, migrated: true }
    }
    throw new Error(
      'Die lokale Datendatei hat ein ungültiges oder unbekanntes Format. Sie bleibt unverändert.'
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return { data: { version: DATA_VERSION, cards: [] }, migrated: false }
}

function currentWindowBounds(): WindowBounds | undefined {
  if (!mainWindow || mainWindow.isDestroyed()) return store.data.window
  const { x, y, width, height } =
    mainWindow.isMaximized() || mainWindow.isMinimized()
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds()
  return { x, y, width, height }
}

function scheduleBoundsSave(): void {
  const window = currentWindowBounds()
  if (window)
    void store.save({ window }).catch((error: unknown) => {
      console.error('Fensterposition konnte nicht gespeichert werden:', error)
    })
}

function restoreBounds(): WindowBounds {
  const saved = store.data.window
  if (!saved) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }

  const display = screen.getDisplayMatching({
    x: saved.x ?? 0,
    y: saved.y ?? 0,
    width: saved.width,
    height: saved.height
  })
  const area = display.workArea
  const width = Math.max(MIN_WIDTH, Math.min(saved.width, area.width))
  const height = Math.max(MIN_HEIGHT, Math.min(saved.height, area.height))
  const x =
    saved.x == null ? undefined : Math.min(Math.max(saved.x, area.x), area.x + area.width - width)
  const y =
    saved.y == null ? undefined : Math.min(Math.max(saved.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

function createWindow(): void {
  const bounds = restoreBounds()
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#17131f',
    title: 'Capacity Planner',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('system-context-menu', (event) => {
    event.preventDefault()
    showHeaderMenu()
  })
  mainWindow.on('move', scheduleBoundsSave)
  mainWindow.on('resize', scheduleBoundsSave)
  mainWindow.on('close', (event) => {
    if (!quitAfterSave) {
      event.preventDefault()
      app.quit()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('app-data:load', () => store.data)
ipcMain.handle('updates:state', () => updates.snapshot)
ipcMain.handle('updates:check', () => updates.check())
ipcMain.handle('updates:download', () => updates.download())
ipcMain.handle('updates:cancel', () => updates.cancel())
ipcMain.handle('updates:install', () => updates.install())
async function planningOperation<T>(action: () => Promise<T>): Promise<T> {
  if (transferBusy || quitting) throw new Error('Bitte den laufenden Vorgang abschließen.')
  transferBusy = true
  try {
    return await action()
  } finally {
    transferBusy = false
  }
}
ipcMain.handle('planning:export', () =>
  planningOperation(async () => {
    if (!mainWindow) throw new Error('Kein Planungsfenster geöffnet.')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Planungsdaten aller Jahre exportieren',
      defaultPath: 'Capacity-Planner-Planungsdaten.json',
      filters: [{ name: 'Planungsdaten (JSON)', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    const directory = app.getPath('userData')
    await transfer.export(
      result.filePath,
      [
        'data.json',
        'data.json.tmp',
        'data.backup.json',
        'data.backup.json.tmp',
        'data.backup.json.rollback',
        'Preferences',
        'Local State'
      ].map((name) => join(directory, name))
    )
    return true
  })
)
ipcMain.handle('planning:preview', () =>
  planningOperation(async () => {
    transfer.cancel()
    if (!mainWindow) throw new Error('Kein Planungsfenster geöffnet.')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Planungsdaten importieren – Vorschau',
      properties: ['openFile'],
      filters: [{ name: 'Planungsdaten (JSON)', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return transfer.preview(result.filePaths[0])
  })
)
ipcMain.handle('planning:cancel', () => {
  transfer.cancel()
})
ipcMain.handle('planning:confirm', (_event, token: unknown) =>
  planningOperation(async () => {
    await transfer.confirm(token)
    return store.data
  })
)
ipcMain.handle('app-data:save', async (_event, value: unknown) => {
  if (transferBusy || quitting) throw new Error('Bitte den laufenden Vorgang zuerst abschließen.')
  if (!isAppData(value)) throw new Error('Ungültiges Capacity-Planner-Datenformat.')
  const window = currentWindowBounds()
  await store.save({
    cards: value.cards,
    ...(value.appearance ? { appearance: value.appearance } : {}),
    ...(window ? { window } : {})
  })
  return { saved: true }
})
ipcMain.handle('app:close', () => app.quit())
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.handle('window:toggle-fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
})
function showHeaderMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  Menu.buildFromTemplate([
    { label: 'Einstellungen', click: () => mainWindow?.webContents.send('settings:open') }
  ]).popup({ window: mainWindow })
}
ipcMain.handle('header:menu', showHeaderMenu)

app
  .whenReady()
  .then(async () => {
    electronApp.setAppUserModelId('de.dkarsiko.capacityplanner')
    const loaded = await loadAppData()
    store = new AppDataStore(
      join(app.getPath('userData'), 'data.json'),
      loaded.data,
      300,
      loaded.migrated
    )
    transfer = new PlanningTransfer(store)
    let target: ReturnType<typeof readReleaseTarget> = null
    let disabledReason: string | null
    try {
      target = readReleaseTarget(
        JSON.parse(await readFile(join(__dirname, '../../resources/release-target.json'), 'utf8'))
      )
      let installed = false
      try {
        installed =
          (await readFile(join(process.resourcesPath, 'capacity-planner-installed'), 'utf8')) ===
          'de.dkarsiko.capacityplanner'
      } catch {
        /* Only the NSIS installer creates this marker. */
      }
      disabledReason = updateDisabledReason({
        platform: process.platform,
        packaged: app.isPackaged,
        installed,
        isolated: Boolean(profile),
        target
      })
    } catch {
      disabledReason = 'Der Updatekanal ist noch nicht korrekt eingerichtet.'
    }
    updates = new UpdateController({
      version: app.getVersion(),
      disabledReason,
      backend: !disabledReason && target ? createUpdateBackend(target) : null,
      notify: (state) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('updates:state', state)
      },
      prepare: async () => {
        if (transferBusy || quitting) throw new Error('Ein anderer Vorgang läuft noch.')
        quitting = true
        try {
          await store.flush()
          quitAfterSave = true
        } catch (error) {
          quitting = false
          throw error
        }
      },
      installFailed: () => {
        quitting = false
        quitAfterSave = false
      }
    })

    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    dialog.showErrorBox(
      'Daten konnten nicht geladen werden',
      error instanceof Error ? error.message : String(error)
    )
    app.exit(1)
  })

app.on('before-quit', (event) => {
  if (!store || quitAfterSave) return
  event.preventDefault()
  if (transferBusy) return
  if (quitting) return
  quitting = true
  const window = currentWindowBounds()
  if (window) void store.save({ window }).catch(() => {})
  void store.flush().then(
    () => {
      quitAfterSave = true
      app.quit()
    },
    () => {
      quitting = false
      void dialog.showMessageBox({
        type: 'error',
        title: 'Speichern fehlgeschlagen',
        message: 'Die Daten konnten nicht gespeichert werden.',
        detail: 'Die App bleibt geöffnet. Bitte prüfe den Speicherort und versuche es erneut.',
        buttons: ['OK']
      })
    }
  )
})

app.on('window-all-closed', () => {
  app.quit()
})
