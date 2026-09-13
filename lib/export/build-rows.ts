import type { Sidebar } from '@/lib/queries/sidebars'
import type { Finding } from '@/lib/queries/findings'
import type { LookupRow } from '@/lib/queries/lookups'
import type { TextRecord } from '@/lib/queries/text-records'
import { resolveView, type ViewColumn } from '@/lib/sidebar-view'

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

  // Same columns, same order as the sidebar's table.
  const { columns } = resolveView(sidebar)

  function cell(f: Finding, column: ViewColumn): string {
    switch (column.builtin) {
      case 'finding_date':
        return f.finding_date.slice(0, 10)
      case 'sample_id':
        return f.sample_id
      case 'sample_type':
        return sampleTypeLabel(f.sample_type_id)
      case 'measurement_type':
        return measurementTypeLabel(f.measurement_type_id)
      case 'measurement_group':
        return f.measurement_group
      case 'apparatus':
        return f.apparatus
      case 'notes':
        return stripHtml(f.notes)
    }
    return f.values[column.field!.key] ?? ''
  }

  return {
    title: sidebar.name,
    headers: columns.map((c) => c.label),
    rows: findings.map((f) => columns.map((c) => cell(f, c))),
  }
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
