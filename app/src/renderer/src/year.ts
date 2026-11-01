export function readStoredYear(value: string | null, currentYear: number): number {
  const year = Number.parseInt(value ?? '', 10)
  return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : currentYear
}
