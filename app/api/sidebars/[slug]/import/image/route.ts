import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { requireRole } from '@/lib/auth-guard'
import { VISION_MODEL, isAiConfigured, xkiro } from '@/lib/ai/provider'
import { getSidebarBySlug } from '@/lib/queries/sidebars'

// Produces candidate rows in the exact same shape lib/import/build-schema.ts
// expects (sample_type/measurement_type as plain labels, values keyed by the
// sidebar's own column keys) — so the client hands the result straight to
// /import/csv's existing preview+commit flow instead of a second validator.
// Never writes to the database itself; extraction only, always reviewed.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const imageBase64: string | undefined = body.imageBase64
  const mediaType: string = body.mediaType || 'image/jpeg'
  if (!imageBase64) return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })

  if (!isAiConfigured()) {
    console.error('[import/image] XKIRO_API_KEY is not set')
    return NextResponse.json({ error: 'Image extraction is not configured. Contact an administrator.' }, { status: 503 })
  }

  const columnDescriptions =
    sidebar.column_schema.map((c) => `"${c.key}" (${c.label}, ${c.type})`).join(', ') || 'none defined for this sidebar'

  const rowSchema = z.object({
    finding_date: z
      .string()
      .default('')
      .describe('Date in YYYY-MM-DD format. Use the most recently written date on the page if one row lacks its own.'),
    sample_id: z.string().default('').describe('Sample or pot number/label, if shown'),
    sample_type_label: z.string().default('').describe('A short sample type name if mentioned (e.g. soil, leaf) — blank if not stated'),
    measurement_type_label: z
      .string()
      .default('')
      .describe('A short measurement type name if mentioned (e.g. NO3, K) — blank if not stated'),
    measurement_group: z.string().default(''),
    values: z.record(z.string(), z.string()).default({}).describe(`Measurement values keyed by: ${columnDescriptions}`),
    apparatus: z.string().default(''),
    notes: z.string().default('').describe('Any handwritten remarks for this row, transcribed verbatim'),
  })

  try {
    const { object } = await generateObject({
      model: xkiro(VISION_MODEL),
      schema: z.object({ rows: z.array(rowSchema) }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'This is a photo of a handwritten research lab notebook page. Extract every distinct data row as a table ' +
                `with: date, sample id, sample type, measurement type, group, the measurement values (${columnDescriptions}), ` +
                "apparatus, and notes. Leave a field blank rather than guessing if it isn't legible or present. Transcribe numbers exactly as written.",
            },
            { type: 'file', mediaType, data: imageBase64 },
          ],
        },
      ],
    })
    return NextResponse.json({ rows: object.rows })
  } catch (error) {
    console.error('[import/image]', error)
    const message = error instanceof Error ? error.message : 'Image extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
