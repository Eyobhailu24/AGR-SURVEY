import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth-guard'
import { listAuditLog } from '@/lib/queries/audit'
import { listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { listSidebars } from '@/lib/queries/sidebars'
import { LogsTable } from '@/components/logs-table'

export default async function LogsPage() {
  const { role } = await getSessionWithRole()
  if (role !== 'super_admin') redirect('/dashboard')

  // Reference data for turning a log row's diff into plain English (e.g.
  // resolving a sample_type_id to its label) — includeArchived so entries
  // about a since-archived sidebar can still resolve its name.
  const [entries, sampleTypes, measurementTypes, sidebars] = await Promise.all([
    listAuditLog(),
    listSampleTypes(),
    listMeasurementTypes(),
    listSidebars(true),
  ])
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Oversight</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Activity log</h2>
      </div>
      <LogsTable initialEntries={entries} lookups={{ sampleTypes, measurementTypes, sidebars }} />
    </div>
  )
}
