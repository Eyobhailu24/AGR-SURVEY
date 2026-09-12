import { tool } from 'ai'
import { z } from 'zod'
import { embedQuerySafe, toVectorLiteral } from '@/lib/ai/embed'
import { searchKnowledge } from '@/lib/queries/knowledge'
import {
  aggregateGrouped,
  aggregateMeasurements,
  describeTab,
  listMeasurements,
  searchNotes,
  type AggregateOp,
  type MeasurementFilters,
} from '@/lib/queries/measurements'

// The model's entire access to the database. It picks a function and
// arguments; it never writes SQL, never sees a connection, and never does
// arithmetic — every number comes back already computed by Postgres.
//
// Each tool returns a plain object including the counts behind a figure, so
// the assistant can say what a number is based on instead of implying more
// precision than the data supports. Failures come back as `{ error }` data
// rather than thrown exceptions: the model can then correct itself (usually
// by calling describeTab first) instead of the whole turn dying.

const opSchema = z
  .enum(['avg', 'min', 'max', 'sum', 'count', 'stddev'])
  .describe('Aggregate to compute over the individual replicate readings.')

const filterShape = {
  tabSlug: z.string().describe('Tab slug, e.g. "nitrate", "potassium", "greenhouse".'),
  columnKey: z.string().describe('Measurement column key within that tab, e.g. "NO3", "K", "B".'),
  measurementGroup: z
    .string()
    .nullish()
    .describe('Optional group filter, e.g. "top" or "bottom". Must match a value from describeTab.'),
  sampleId: z.string().nullish().describe('Optional sample id filter, e.g. "1".'),
  dateFrom: z.string().nullish().describe('Optional inclusive start date, YYYY-MM-DD.'),
  dateTo: z.string().nullish().describe('Optional inclusive end date, YYYY-MM-DD.'),
}

type FilterInput = {
  tabSlug: string
  columnKey: string
  measurementGroup?: string | null
  sampleId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

function toFilters(input: FilterInput): MeasurementFilters {
  return {
    tabSlug: input.tabSlug,
    columnKey: input.columnKey,
    measurementGroup: input.measurementGroup ?? null,
    sampleId: input.sampleId ?? null,
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
  }
}

/**
 * Guards against the two mistakes a model reliably makes: inventing a tab
 * slug, and inventing a column key. Both would otherwise return a silent
 * zero — which reads like "no data" and is far more dangerous than an error.
 */
async function resolveColumn(tabSlug: string, columnKey: string) {
  const tab = await describeTab(tabSlug)
  if (!tab) return { error: `No tab with slug "${tabSlug}". Call describeTab or use the tab list in your instructions.` as const }

  const column = tab.columns.find((c) => c.key === columnKey)
  if (!column) {
    const available = tab.columns.map((c) => c.key).join(', ') || 'none'
    return { error: `Tab "${tabSlug}" has no column "${columnKey}". Available columns: ${available}.` as const }
  }
  return { tab, column }
}

export const researchTools = {
  describeTab: tool({
    description:
      'Inspect one tab before querying it: its measurement columns, the real measurement_group and sample_id values present, row count and date range. Call this first whenever you are unsure of a column key or group name.',
    inputSchema: z.object({
      tabSlug: z.string().describe('Tab slug, e.g. "nitrate".'),
    }),
    async execute({ tabSlug }) {
      const tab = await describeTab(tabSlug)
      if (!tab) return { error: `No tab with slug "${tabSlug}".` }
      return tab
    },
  }),

  aggregateMeasurements: tool({
    description:
      'Compute one statistic (avg/min/max/sum/count/stddev) for a measurement column, optionally filtered by group, sample or date range. Replicate readings stored in a single cell are expanded into individual values first. Returns the figure plus how many replicates and how many recorded rows it came from.',
    inputSchema: z.object({ ...filterShape, op: opSchema }),
    async execute({ op, ...input }) {
      const resolved = await resolveColumn(input.tabSlug, input.columnKey)
      if ('error' in resolved) return resolved

      const result = await aggregateMeasurements(toFilters(input), op as AggregateOp)
      if (result.replicateCount === 0) {
        return { ...result, unit: resolved.column.unit ?? null, note: 'No matching numeric readings for these filters.' }
      }
      return {
        ...result,
        columnLabel: resolved.column.label,
        unit: resolved.column.unit ?? null,
        tab: resolved.tab.name,
      }
    },
  }),

  compareByGroup: tool({
    description:
      'Compute the same statistic split by one axis — measurement_group (e.g. top vs bottom leaf), sample_id, or finding_date. Use this for comparisons and for trends over time (group by finding_date).',
    inputSchema: z.object({
      ...filterShape,
      op: opSchema,
      groupBy: z
        .enum(['measurement_group', 'sample_id', 'finding_date'])
        .describe('Axis to split by. Use finding_date for a time trend.'),
    }),
    async execute({ op, groupBy, ...input }) {
      const resolved = await resolveColumn(input.tabSlug, input.columnKey)
      if ('error' in resolved) return resolved

      const groups = await aggregateGrouped(toFilters(input), op as AggregateOp, groupBy)
      if (groups.length === 0) return { groups, note: 'No matching numeric readings for these filters.' }
      return {
        op,
        groupBy,
        columnLabel: resolved.column.label,
        unit: resolved.column.unit ?? null,
        tab: resolved.tab.name,
        groups,
      }
    },
  }),

  listMeasurements: tool({
    description:
      'Fetch individual recorded rows (capped at 50), each with the cell exactly as the researcher wrote it plus the parsed replicate values. Use when the user asks to see actual records, or to check an unusual figure.',
    inputSchema: z.object({
      ...filterShape,
      limit: z.number().int().min(1).max(50).default(25).describe('Maximum rows to return.'),
    }),
    async execute({ limit, ...input }) {
      const resolved = await resolveColumn(input.tabSlug, input.columnKey)
      if ('error' in resolved) return resolved

      const rows = await listMeasurements(toFilters(input), limit)
      return {
        tab: resolved.tab.name,
        columnLabel: resolved.column.label,
        unit: resolved.column.unit ?? null,
        rowCount: rows.length,
        rows,
      }
    },
  }),

  searchKnowledge: tool({
    description:
      'Search the approved research-document library (uploaded papers and references) for published agricultural knowledge. Use this for scientific questions — why a measurement matters, what a nutrient does, what the literature says. This is published literature, NOT this experiment\'s data; never mix the two without saying which is which. Every passage comes back with a document title and page numbers that you must cite.',
    inputSchema: z.object({
      query: z.string().min(3).describe('What to look for, in natural language. Supports quoted phrases.'),
      limit: z.number().int().min(1).max(8).default(6).describe('Maximum passages to return.'),
    }),
    async execute({ query, limit }) {
      // Null vector = embedding unavailable; searchKnowledge then runs
      // lexical-only rather than failing the question.
      const queryVector = await embedQuerySafe(query)
      const hits = await searchKnowledge({
        query,
        queryVector: queryVector ? toVectorLiteral(queryVector) : null,
        limit,
      })

      if (hits.length === 0) {
        return {
          hits,
          note: 'No approved research documents matched. Say so — do not answer from memory as though a source had been found, and do not cite anything.',
        }
      }
      return {
        retrieval: queryVector ? 'hybrid (keyword + meaning)' : 'keyword only (semantic search unavailable)',
        hits: hits.map((hit) => ({
          title: hit.title,
          authors: hit.authors || null,
          publishedYear: hit.publishedYear,
          source: hit.source || null,
          pages: hit.pageFrom === hit.pageTo ? hit.pageFrom : `${hit.pageFrom}-${hit.pageTo}`,
          heading: hit.heading || null,
          passage: hit.content,
          matchedBy: hit.matchedBy,
        })),
      }
    },
  }),

  searchNotes: tool({
    description:
      "Full-text search the researcher's own written records — dated text records and per-row notes. Use for questions about observations, remarks or context rather than numbers.",
    inputSchema: z.object({
      query: z.string().min(2).describe('Search terms. Supports quoted phrases and -exclusions.'),
      tabSlug: z.string().nullish().describe('Optional: restrict to one tab.'),
      limit: z.number().int().min(1).max(25).default(10),
    }),
    async execute({ query, tabSlug, limit }) {
      const hits = await searchNotes(query, tabSlug ?? null, limit)
      if (hits.length === 0) return { hits, note: 'No written records matched those terms.' }
      return { hits }
    },
  }),
}
