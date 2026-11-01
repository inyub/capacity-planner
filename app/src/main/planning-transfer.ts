import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createPlanningFile, readPlanningFile } from '../shared/planning-transfer.ts'
import type { Card, PlanningPreview } from '../shared/types'
import type { AppDataStore } from './data-store'

export class PlanningTransfer {
  private pending: { token: string; cards: Card[]; expected: string } | null = null
  private store: AppDataStore

  constructor(store: AppDataStore) {
    this.store = store
  }

  cancel(): void {
    this.pending = null
  }

  async preview(file: string): Promise<PlanningPreview> {
    this.cancel()
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      throw new Error('Die Datei konnte nicht gelesen werden oder enthält kein gültiges JSON.')
    }
    const cards = readPlanningFile(parsed)
    const token = randomUUID()
    this.pending = { token, cards, expected: JSON.stringify(this.store.data.cards) }
    const counts = new Map<number, number>()
    for (const card of cards) counts.set(card.year, (counts.get(card.year) ?? 0) + 1)
    return {
      token,
      fileName: basename(file),
      dataVersion: (parsed as { dataVersion: number }).dataVersion,
      cardCount: cards.length,
      years: [...counts].sort(([a], [b]) => a - b).map(([year, count]) => ({ year, count })),
      existingCardCount: this.store.data.cards.length,
      existingYears: [...new Set(this.store.data.cards.map((card) => card.year))].sort(
        (a, b) => a - b
      )
    }
  }

  async confirm(token: unknown): Promise<void> {
    const pending = this.pending
    this.cancel()
    if (!pending || token !== pending.token)
      throw new Error('Bitte zuerst eine neue Importvorschau öffnen.')
    const cards = readPlanningFile(createPlanningFile(pending.cards))
    await this.store.replacePlanning(cards, pending.expected)
  }

  async export(file: string, protectedFiles: string[]): Promise<void> {
    const target = resolve(file)
    const temp = `${target}.${randomUUID()}.tmp`
    if (protectedFiles.some((path) => resolve(path).toLowerCase() === target.toLowerCase())) {
      throw new Error('Bitte eine separate Exportdatei außerhalb der internen Datendateien wählen.')
    }
    const serialized = JSON.stringify(createPlanningFile(this.store.data.cards), null, 2)
    try {
      await writeFile(temp, serialized, { encoding: 'utf8', flag: 'wx' })
      await rename(temp, target)
    } finally {
      await unlink(temp).catch(() => {})
    }
  }
}
