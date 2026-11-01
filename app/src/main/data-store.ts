import { copyFile, mkdir, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppData, Card } from '../shared/types'

type Update = Partial<Pick<AppData, 'cards' | 'window' | 'appearance'>>
type Waiter = { resolve: () => void; reject: (error: unknown) => void }

export class AppDataStore {
  private persisted: AppData
  private pending: Update | null = null
  private waiters: Waiter[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private queue = Promise.resolve()
  private lastWrite = Promise.resolve()
  private file: string
  private delay: number
  private needsMigration: boolean

  constructor(file: string, initial: AppData, delay = 300, needsMigration = false) {
    this.needsMigration = needsMigration
    this.file = file
    this.delay = delay
    this.persisted = initial
  }

  get data(): AppData {
    return this.persisted
  }

  save(update: Update): Promise<void> {
    this.pending = { ...this.pending, ...update }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {})
    }, this.delay)
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  async replacePlanning(cards: Card[], expectedCards: string): Promise<void> {
    if (this.pending) await this.flush()
    else await this.queue
    const write = this.queue.then(async () => {
      if (JSON.stringify(this.persisted.cards) !== expectedCards) {
        throw new Error('Die Planung wurde inzwischen geändert. Bitte eine neue Vorschau öffnen.')
      }
      await this.persist({ ...this.persisted, cards }, true)
    })
    this.queue = write.catch(() => {})
    this.lastWrite = write
    return write
  }

  private async persist(next: AppData, replacing = false): Promise<void> {
    const serialized = JSON.stringify(next, null, 2)
    if (
      !replacing &&
      !this.needsMigration &&
      serialized === JSON.stringify(this.persisted, null, 2)
    )
      return
    const directory = dirname(this.file)
    const backup = join(directory, 'data.backup.json')
    const stagedBackup = `${backup}.tmp`
    const rollback = `${backup}.rollback`
    let hadBackup = false
    let changedBackup = false
    let keepRollback = false
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(`${this.file}.tmp`, serialized, 'utf8')
      let hasOriginal = true
      try {
        await copyFile(this.file, stagedBackup)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        hasOriginal = false
        if (replacing)
          await writeFile(stagedBackup, JSON.stringify(this.persisted, null, 2), 'utf8')
      }
      if (hasOriginal || replacing) {
        try {
          await copyFile(backup, rollback)
          hadBackup = true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await rename(stagedBackup, backup)
        changedBackup = true
      }
      try {
        await rename(`${this.file}.tmp`, this.file)
      } catch (error) {
        if (changedBackup) {
          try {
            if (hadBackup) await rename(rollback, backup)
            else await unlink(backup)
          } catch (restoreError) {
            keepRollback = hadBackup
            throw new AggregateError(
              [error, restoreError],
              'Speichern und Backup-Wiederherstellung fehlgeschlagen. Sicherungsdateien bitte erhalten.',
              { cause: restoreError }
            )
          }
        }
        throw error
      }
      this.persisted = next
      this.needsMigration = false
    } finally {
      await Promise.all(
        [`${this.file}.tmp`, stagedBackup, ...(keepRollback ? [] : [rollback])].map((file) =>
          unlink(file).catch(() => {})
        )
      )
    }
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    if (!this.pending) return this.lastWrite
    const update = this.pending
    const waiters = this.waiters
    this.pending = null
    this.waiters = []
    const write = this.queue.then(async () => {
      const next = { ...this.persisted, ...update }
      await this.persist(next)
    })
    this.queue = write.catch(() => {})
    this.lastWrite = write
    void write.then(
      () => waiters.forEach((waiter) => waiter.resolve()),
      (error: unknown) => waiters.forEach((waiter) => waiter.reject(error))
    )
    return write
  }
}
