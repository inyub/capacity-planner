import { migrateAppData } from './migration.ts'
import type { Card } from './types'

export interface PlanningFile {
  format: 'capacity-planner-planning'
  formatVersion: 1
  dataVersion: 2
  cards: Card[]
}

function planningCard(card: Card): Card {
  const {
    id,
    year,
    month,
    order,
    label,
    title,
    description,
    minutesMin,
    minutesMax,
    timeUnit,
    revenueMin,
    revenueMax,
    currency,
    expanded,
    week
  } = card
  return {
    id,
    year,
    month,
    order,
    label,
    title,
    description,
    minutesMin,
    minutesMax,
    timeUnit,
    revenueMin,
    revenueMax,
    currency,
    expanded,
    ...(week === undefined ? {} : { week })
  }
}

export function readPlanningFile(value: unknown): Card[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Die Datei enthält kein Planungsdaten-Objekt.')
  }
  const source = value as Record<string, unknown>
  if (source.format !== 'capacity-planner-planning' || source.formatVersion !== 1) {
    throw new Error('Unbekanntes Planungsformat oder unbekannte Formatversion.')
  }
  if (source.dataVersion !== 1 && source.dataVersion !== 2) {
    throw new Error('Unbekannte Datenversion. Unterstützt werden Version 1 und 2.')
  }
  const data = migrateAppData({ version: source.dataVersion, cards: source.cards })
  if (!data) {
    throw new Error(
      'Ungültige Karten: Bitte IDs (eindeutig), Jahr (1–9999), Monat (0–11), Reihenfolge, Textfelder, Zeit- und Umsatzbereiche sowie Einheiten (m/h/d), Währungen (EUR/CHF) und Kalenderwochen (1–53) prüfen.'
    )
  }
  return data.cards.map(planningCard)
}

export function createPlanningFile(cards: Card[]): PlanningFile {
  const file: PlanningFile = {
    format: 'capacity-planner-planning',
    formatVersion: 1,
    dataVersion: 2,
    cards: cards.map(planningCard)
  }
  readPlanningFile(file)
  return file
}
