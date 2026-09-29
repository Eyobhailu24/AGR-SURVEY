import { z } from 'zod'
import type { Sidebar } from '@/lib/queries/sidebars'

export function buildImageExtractionRequest(
  sidebar: Pick<Sidebar, 'column_schema'>,
  imageBase64: string,
  mediaType: string,
) {
  const columnDescriptions =
    sidebar.column_schema.map((c) => `"${c.key}" (${c.label}, ${c.type})`).join(', ') || 'none defined for this sidebar'

  const schema = z.object({
    rows: z.array(z.object({
      finding_date: z.string().default('').describe(
        'Date in YYYY-MM-DD format. Use the most recently written date on the page if one row lacks its own. Leave blank if no date is present.',
      ),
      sample_id: z.string().default('').describe('Sample or pot number/label, if shown'),
      sample_type_label: z.string().default('').describe('Sample type if explicitly stated; otherwise blank'),
      measurement_type_label: z.string().default('').describe('Measurement type if explicitly stated; otherwise blank'),
      measurement_group: z.string().default(''),
      values: z.record(z.string(), z.string()).default({}).describe(
        `Measurement values as strings, using these exact column keys: ${columnDescriptions}`,
      ),
      apparatus: z.string().default(''),
      notes: z.string().default('').describe('Remarks for this row, transcribed verbatim'),
    })),
  })

  return {
    schema,
    // The compatible gateway uses json_object mode, which does not send the
    // response schema to the model. Include it in the prompt as well as using
    // it to validate the response, or the model invents incompatible keys.
    system: [
      'Read the supplied notebook image and return only a JSON object matching this schema:',
      JSON.stringify(z.toJSONSchema(schema)),
      'The top-level key must be "rows". Use the exact property names in the schema.',
      'All field values and measurement values must be strings, including numbers.',
      'Use only the supplied column keys inside "values", not their display labels.',
      'Leave missing or illegible fields blank. Do not invent observations or dates.',
      'Return {"rows":[]} if there are no readable data rows.',
    ].join('\n'),
    messages: [{
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Extract every distinct data row from this research lab notebook image. ' +
            `The measurement columns are: ${columnDescriptions}. ` +
            'Transcribe numbers exactly as written, including decimal places, and preserve row remarks.',
        },
        { type: 'file' as const, mediaType, data: imageBase64 },
      ],
    }],
  }
}
