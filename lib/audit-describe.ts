import { formatDateDisplay } from '@/lib/utils'
import type { AuditEntry } from '@/lib/queries/audit'
import type { LookupRow } from '@/lib/queries/lookups'
import type { Sidebar } from '@/lib/queries/sidebars'

// Turns a raw audit_log row (a machine-shaped action code + a jsonb diff)
// into three plain-English strings for the Activity log table. Pure and
// client-safe (no DB access) so it can run on rows fetched via "Load more"
// too, not just the server-rendered first page.

const ACTION_LABELS: Record<string, string> = {
  'user.create': 'Added a user',
  'user.delete': 'Removed a user',
  'user.role_change': 'Changed a role',
  'sample_type.create': 'Added a sample type',
  'measurement_type.create': 'Added a measurement type',
  'sidebar.create': 'Created a sidebar',
  'sidebar.archive': 'Archived a sidebar',
  'sidebar.update': 'Edited a sidebar',
  export: 'Exported data',
  'finding.create': 'Added a finding',
  'finding.update': 'Edited a finding',
  'finding.delete': 'Deleted a finding',
  'import.csv': 'Imported a CSV',
  'text_record.upsert': 'Saved a text record',
  'text_record.delete': 'Deleted a text record',
}

const ROLE_LABELS: Record<string, string> = {
  pending: 'Pending',
  reader: 'Reader',
  editor: 'Editor',
  super_admin: 'Super Admin',
  revoked: 'Revoked',
}

const FIELD_LABELS: Record<string, string> = {
  finding_date: 'date',
  sample_id: 'sample',
  sample_type_id: 'sample type',
  measurement_type_id: 'measurement type',
  measurement_group: 'group',
  apparatus: 'apparatus',
  notes: 'notes',
  values: 'measurements',
}

// Fallback for any future action code that isn't in ACTION_LABELS yet —
// still renders as words instead of a raw code, just less tailored.
function humanizeCode(code: string) {
  return code
    .replace(/[._]/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function dateOrRaw(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDateDisplay(value.slice(0, 10))
  return value == null || value === '' ? '—' : String(value)
}

export type AuditLookups = { sampleTypes: LookupRow[]; measurementTypes: LookupRow[]; sidebars: Sidebar[] }

export function describeAuditEntry(
  entry: AuditEntry,
  { sampleTypes, measurementTypes, sidebars }: AuditLookups,
): { action: string; entity: string; details: string } {
  const action = ACTION_LABELS[entry.action] ?? humanizeCode(entry.action)
  const diff = isRecord(entry.diff) ? entry.diff : {}
  const after = isRecord(diff.after) ? diff.after : undefined
  const before = isRecord(diff.before) ? diff.before : undefined
  const sidebarSlug = asString(diff.sidebar)
  const sidebarName = sidebarSlug ? (sidebars.find((s) => s.slug === sidebarSlug)?.name ?? sidebarSlug) : undefined

  const sampleTypeLabel = (id: unknown) => sampleTypes.find((s) => s.id === id)?.label ?? '—'
  const measurementTypeLabel = (id: unknown) => measurementTypes.find((m) => m.id === id)?.label ?? '—'

  switch (entry.action) {
    case 'user.create':
    case 'user.role_change': {
      const email = asString(after?.email) ?? entry.entity_id ?? 'a user'
      const role = ROLE_LABELS[String(after?.role)] ?? String(after?.role ?? '—')
      return { action, entity: email, details: entry.action === 'user.create' ? `Added as ${role}` : `Role set to ${role}` }
    }
    case 'user.delete': {
      const email = asString(before?.email) ?? entry.entity_id ?? 'a user'
      const role = ROLE_LABELS[String(before?.role)] ?? String(before?.role ?? '—')
      return { action, entity: email, details: `Was ${role}` }
    }
    case 'sample_type.create': {
      const label = asString(after?.label) ?? 'Sample type'
      return { action, entity: label, details: 'New sample type option' }
    }
    case 'measurement_type.create': {
      const label = asString(after?.label) ?? 'Measurement type'
      const unit = asString(after?.unit)
      return { action, entity: label, details: unit ? `New measurement type option · unit: ${unit}` : 'New measurement type option' }
    }
    case 'sidebar.create': {
      const name = asString(after?.name) ?? 'Sidebar'
      const notesOnly = Boolean(after?.notes_only)
      return { action, entity: name, details: notesOnly ? 'Notes-only tab' : 'Findings tab' }
    }
    case 'sidebar.archive': {
      const name = asString(before?.name) ?? 'Sidebar'
      return { action, entity: name, details: 'Removed from the tab list' }
    }
    case 'sidebar.update': {
      const name = asString(after?.name) ?? asString(before?.name) ?? 'Sidebar'
      const columnCount = Array.isArray(after?.column_schema) ? after.column_schema.length : 0
      return {
        action,
        entity: name,
        details: after?.notes_only ? 'Notes-only tab' : `Columns, sorting or filters · ${columnCount} custom column${columnCount === 1 ? '' : 's'}`,
      }
    }
    case 'export': {
      const kind = diff.kind === 'text-records' ? 'text records' : 'findings'
      const format = asString(diff.format)?.toUpperCase() ?? 'file'
      const rowCount = Number(diff.rowCount ?? 0)
      return {
        action,
        entity: sidebarName ?? 'Sidebar',
        details: `${format} · ${kind} · ${rowCount} row${rowCount === 1 ? '' : 's'}`,
      }
    }
    case 'finding.create':
    case 'finding.delete': {
      const source = entry.action === 'finding.create' ? after : before
      const sample = asString(source?.sample_id) ?? 'unlabeled sample'
      const date = source?.finding_date ? dateOrRaw(source.finding_date) : null
      return { action, entity: sidebarName ?? 'Finding', details: `Sample ${sample}${date ? ` · ${date}` : ''}` }
    }
    case 'finding.update': {
      const changes: string[] = []
      for (const key of Object.keys(FIELD_LABELS)) {
        const b = before?.[key]
        const a = after?.[key]
        if (JSON.stringify(b) === JSON.stringify(a)) continue
        const label = FIELD_LABELS[key]
        if (key === 'sample_type_id') changes.push(`${label} ${sampleTypeLabel(b)} → ${sampleTypeLabel(a)}`)
        else if (key === 'measurement_type_id') changes.push(`${label} ${measurementTypeLabel(b)} → ${measurementTypeLabel(a)}`)
        else if (key === 'notes' || key === 'values') changes.push(`${label} updated`)
        else if (key === 'finding_date') changes.push(`${label} ${dateOrRaw(b)} → ${dateOrRaw(a)}`)
        else changes.push(`${label} ${b || '—'} → ${a || '—'}`)
      }
      const sample = asString(after?.sample_id) ?? asString(before?.sample_id) ?? 'unlabeled sample'
      return {
        action,
        entity: sidebarName ?? 'Finding',
        details: changes.length > 0 ? `Sample ${sample} — ${changes.join('; ')}` : `Sample ${sample} — no field changes`,
      }
    }
    case 'import.csv': {
      const inserted = Number(diff.insertedCount ?? 0)
      const skipped = Number(diff.skippedCount ?? 0)
      return {
        action,
        entity: sidebarName ?? 'Sidebar',
        details: `${inserted} row${inserted === 1 ? '' : 's'} added${skipped ? `, ${skipped} skipped` : ''}`,
      }
    }
    case 'text_record.upsert': {
      const date = after?.record_date ? dateOrRaw(after.record_date) : null
      return { action, entity: sidebarName ?? 'Text record', details: date ? `Note for ${date}` : 'Note saved' }
    }
    case 'text_record.delete': {
      const date = before?.record_date ? dateOrRaw(before.record_date) : null
      return { action, entity: sidebarName ?? 'Text record', details: date ? `Note for ${date}` : 'Note removed' }
    }
    default:
      return {
        action,
        entity: humanizeCode(entry.entity_type),
        details: entry.entity_id ? `#${entry.entity_id}` : '—',
      }
  }
}
