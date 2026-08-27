import type { Sidebar } from '@/lib/queries/sidebars'
import type { LookupRow } from '@/lib/queries/lookups'
import type { Finding } from '@/lib/queries/findings'
import { buildFindingRowSchema } from './build-schema'
import { sanitizeRichText } from '@/lib/sanitize-html'

export type RowResult =
  | { index: number; ok: true; row: Omit<Finding, 'id' | 'created_by' | 'updated_by'> }
  | { index: number; ok: false; errors: string[] }

function findLookupId(list: LookupRow[], label: string): number | null {
  if (!label.trim()) return null
  const match = list.find((l) => l.label.toLowerCase() === label.trim().toLowerCase())
  return match?.id ?? null
}

// Shared by CSV import and image-OCR import: both produce the same
// "sample_type/measurement_type as plain text labels" shape (a human or a
// vision model writes/reads labels, not internal ids), resolved here against
// the sidebar's live lookup lists — never a client-side guess.
export function resolveImportRows(
  sidebar: Sidebar,
  rawRows: unknown[],
  sampleTypes: LookupRow[],
  measurementTypes: LookupRow[],
): RowResult[] {
  const schema = buildFindingRowSchema(sidebar)

  return rawRows.map((raw, index) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return { index, ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`) }
    }
    const data = parsed.data
    const errors: string[] = []

    const sampleTypeId = findLookupId(sampleTypes, data.sample_type_label)
    if (data.sample_type_label && sampleTypeId === null) {
      errors.push(`Sample type "${data.sample_type_label}" doesn't match any existing type`)
    }
    const measurementTypeId = findLookupId(measurementTypes, data.measurement_type_label)
    if (data.measurement_type_label && measurementTypeId === null) {
      errors.push(`Measurement type "${data.measurement_type_label}" doesn't match any existing type`)
    }

    if (errors.length > 0) return { index, ok: false, errors }

    return {
      index,
      ok: true,
      row: {
        finding_date: data.finding_date,
        sample_id: data.sample_id,
        sample_type_id: sampleTypeId,
        measurement_type_id: measurementTypeId,
        measurement_group: data.measurement_group,
        values: data.values,
        apparatus: data.apparatus,
        notes: sanitizeRichText(data.notes),
      },
    }
  })
}
