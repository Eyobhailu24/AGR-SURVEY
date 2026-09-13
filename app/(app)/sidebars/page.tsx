import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth-guard'
import { listSidebars } from '@/lib/queries/sidebars'
import { SidebarsManager } from '@/components/sidebars-manager'

export default async function ManageSidebarsPage() {
  const { role } = await getSessionWithRole()
  if (role !== 'editor' && role !== 'super_admin') redirect('/dashboard')

  const sidebars = await listSidebars()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Workspace</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Manage sidebars</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add new sidebars or remove ones you no longer need. Removing a sidebar hides it from everyone&apos;s
          navigation.
        </p>
      </div>
      <SidebarsManager sidebars={sidebars} />
    </div>
  )
}
