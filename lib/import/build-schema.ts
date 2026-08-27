import { z } from 'zod'
import type { Sidebar } from '@/lib/queries/sidebars'

// One schema builder shared by CSV import and image-OCR import: both land on
// the same "row shaped like a finding, but sample_type/measurement_type as
// plain labels instead of ids" contract, resolved to ids server-side against
// the live lookup tables (see the import route handlers).
// `values` is a plain string->string dictionary rather than a strict
// per-column object: the set of keys is defined by the sidebar's own
// column_schema, which is data (can change per sidebar, per row import), not
// something worth encoding as static per-key zod fields here. Missing/required
// columns are surfaced in the UI (empty cells), not as an import error.
export function buildFindingRowSchema(sidebar: Sidebar) {
  const requiredKeys = new Set(sidebar.column_schema.filter((c) => c.required).map((c) => c.key))

  return z
    .object({
      finding_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
      sample_id: z.string().optional().default(''),
      measurement_group: z.string().optional().default(''),
      apparatus: z.string().optional().default(''),
      notes: z.string().optional().default(''),
      sample_type_label: z.string().optional().default(''),
      measurement_type_label: z.string().optional().default(''),
      values: z.record(z.string(), z.string()).default({}),
    })
    .superRefine((data, ctx) => {
      for (const key of requiredKeys) {
        if (!data.values[key]?.trim()) {
          ctx.addIssue({ code: 'custom', path: ['values', key], message: `${key} is required` })
        }
      }
    })
}

export type FindingRowInput = z.infer<ReturnType<typeof buildFindingRowSchema>>
