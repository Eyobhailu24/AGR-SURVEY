import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Plain 'YYYY-MM-DD' date strings (finding_date, record_date, ...) have no
// time component — parse as local Y/M/D, not via the ISO-string Date
// constructor (which reads it as UTC midnight and can render as the
// previous day in negative-UTC timezones), so the displayed date never shifts.
export function formatDateDisplay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
