import type { UpdateState } from '../shared/updates'

export interface UpdateBackend {
  check: () => Promise<{ available: boolean; version: string }>
  download: (
    progress: (value: { percent: number; transferred: number; total: number }) => void
  ) => Promise<void>
  cancel: () => void
  install: () => void
  onError: (callback: (error: unknown) => void) => void
}

export class UpdateController {
  private state: UpdateState
  private backend: UpdateBackend | null
  private notify: (state: UpdateState) => void
  private prepare: () => Promise<void>
  private installFailed: () => void
  private running = false
  private cancelled = false

  constructor(options: {
    version: string
    disabledReason: string | null
    backend: UpdateBackend | null
    notify: (state: UpdateState) => void
    prepare: () => Promise<void>
    installFailed: () => void
  }) {
    this.backend = options.backend
    this.notify = options.notify
    this.prepare = options.prepare
    this.installFailed = options.installFailed
    this.state = {
      status: options.disabledReason ? 'disabled' : 'idle',
      currentVersion: options.version,
      message: options.disabledReason ?? 'Suche nur auf deinen Wunsch nach Updates.'
    }
    this.backend?.onError(() => {
      if (this.state.status === 'installing') this.installFailed()
      if (!this.cancelled)
        this.set({
          status: 'error',
          message:
            'Update fehlgeschlagen. Bitte Verbindung und Speicherort prüfen und erneut versuchen.'
        })
    })
  }

  get snapshot(): UpdateState {
    return { ...this.state }
  }

  private set(change: Partial<UpdateState>): void {
    this.state = { ...this.state, ...change }
    this.notify(this.snapshot)
  }

  async check(): Promise<void> {
    if (
      !this.backend ||
      this.running ||
      this.state.status === 'disabled' ||
      this.state.status === 'installing'
    )
      return
    this.running = true
    this.cancelled = false
    this.set({
      status: 'checking',
      version: undefined,
      percent: undefined,
      transferred: undefined,
      total: undefined,
      message: 'Nach Updates suchen …'
    })
    try {
      const result = await this.backend.check()
      this.set({
        status: result.available ? 'available' : 'current',
        version: result.available ? result.version : undefined,
        message: result.available
          ? `Version ${result.version} ist verfügbar.`
          : 'Du verwendest die aktuelle Version.'
      })
    } catch {
      this.set({
        status: 'error',
        message: 'Updates konnten nicht geprüft werden. Bitte Verbindung und Updatekanal prüfen.'
      })
    } finally {
      this.running = false
    }
  }

  async download(): Promise<void> {
    if (!this.backend || this.running || this.state.status !== 'available') return
    this.running = true
    this.cancelled = false
    this.set({
      status: 'downloading',
      percent: 0,
      transferred: 0,
      total: undefined,
      message: 'Vollständiges Update herunterladen …'
    })
    try {
      await this.backend.download((progress) => {
        if (this.cancelled || this.state.status !== 'downloading') return
        if (![progress.percent, progress.transferred, progress.total].every(Number.isFinite)) return
        this.set({
          percent: Math.max(0, Math.min(100, progress.percent)),
          transferred: Math.max(0, progress.transferred),
          total: Math.max(0, progress.total)
        })
      })
      if (this.cancelled || this.snapshot.status !== 'downloading') return
      this.set({
        status: 'downloaded',
        percent: 100,
        message: 'Update geprüft und bereit zur Installation.'
      })
    } catch {
      if (!this.cancelled)
        this.set({
          status: 'error',
          message: 'Download oder Dateiprüfung fehlgeschlagen. Es wurde nichts installiert.'
        })
    } finally {
      this.running = false
      if (this.cancelled)
        this.set({
          status: 'available',
          percent: undefined,
          transferred: undefined,
          total: undefined,
          message: 'Download abgebrochen. Die vorhandene Installation bleibt erhalten.'
        })
    }
    if (!this.cancelled && this.snapshot.status === 'downloaded') await this.install()
  }

  cancel(): void {
    if (!this.backend || this.state.status !== 'downloading') return
    this.cancelled = true
    this.backend.cancel()
    this.set({ message: 'Download wird abgebrochen …' })
  }

  async install(): Promise<void> {
    if (!this.backend || this.running || this.state.status !== 'downloaded') return
    this.running = true
    let prepared = false
    try {
      await this.prepare()
      prepared = true
      this.set({
        status: 'installing',
        message: 'Update wird installiert. Die App startet anschließend neu.'
      })
      this.backend.install()
    } catch {
      this.installFailed()
      this.set({
        status: 'downloaded',
        message: prepared
          ? 'Der Installer konnte nicht gestartet werden. Bitte erneut versuchen.'
          : 'Installation nicht gestartet. Die Planung konnte nicht sicher gespeichert werden. Bitte zuerst Speicherfehler beheben.'
      })
    } finally {
      this.running = false
    }
  }
}
