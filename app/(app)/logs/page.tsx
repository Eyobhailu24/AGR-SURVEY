import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth-guard'
import { listAuditLog } from '@/lib/queries/audit'
import { LogsTable } from '@/components/logs-table'

export default async function LogsPage() {
  const { role } = await getSessionWithRole()
  if (role !== 'super_admin') redirect('/')

  const entries = await listAuditLog()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Oversight</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Activity log</h2>
      </div>
      <LogsTable initialEntries={entries} />
    </div>
  )
}
