import type { Sidebar } from '@/lib/queries/sidebars'
import type { Finding } from '@/lib/queries/findings'
import type { LookupRow } from '@/lib/queries/lookups'
import type { TextRecord } from '@/lib/queries/text-records'

export type ExportTable = { title: string; headers: string[]; rows: string[][] }

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Shared shape every export format (CSV/XLSX/DOCX/Google Sheet/Google Doc)
// renders from — keeps the five writers from re-deriving column meaning
// independently and drifting from each other.
export function buildExportTable(
  sidebar: Sidebar,
  findings: Finding[],
  sampleTypes: LookupRow[],
  measurementTypes: LookupRow[],
): ExportTable {
  const sampleTypeLabel = (id: number | null) => sampleTypes.find((s) => s.id === id)?.label ?? ''
  const measurementTypeLabel = (id: number | null) => measurementTypes.find((m) => m.id === id)?.label ?? ''

  const headers = [
    'Date',
    'Sample',
    'Sample type',
    'Measurement type',
    'Group',
    ...sidebar.column_schema.map((c) => c.label),
    'Apparatus',
    'Notes',
  ]

  const rows = findings.map((f) => [
    f.finding_date.slice(0, 10),
    f.sample_id,
    sampleTypeLabel(f.sample_type_id),
    measurementTypeLabel(f.measurement_type_id),
    f.measurement_group,
    ...sidebar.column_schema.map((c) => f.values[c.key] ?? ''),
    f.apparatus,
    stripHtml(f.notes),
  ])

  return { title: sidebar.name, headers, rows }
}

// Word/Google Doc exports are for the free-form text records (one per date),
// not the findings grid — CSV/Excel/Google Sheet cover that. Kept on the
// same ExportTable shape so it reuses the existing docx/Google Doc writers.
export function buildTextRecordsExportTable(sidebar: Sidebar, records: TextRecord[]): ExportTable {
  return {
    title: `${sidebar.name} — Text records`,
    headers: ['Date', 'Notes'],
    rows: records.map((r) => [r.record_date.slice(0, 10), stripHtml(r.body)]),
  }
}
