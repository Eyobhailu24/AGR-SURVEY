import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth-guard'
import { listAppUsers } from '@/lib/queries/app-users'
import { UsersTable } from '@/components/users-table'

export default async function AdminUsersPage() {
  const { role } = await getSessionWithRole()
  if (role !== 'super_admin') redirect('/')

  const users = await listAppUsers()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Team &amp; access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New sign-ins start as Pending until you approve them with a role here.
        </p>
      </div>
      <UsersTable initialUsers={users} />
    </div>
  )
}
