'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AppRole, AppUser } from '@/lib/queries/app-users'

const ROLE_LABELS: Record<AppRole, string> = {
  pending: 'Pending',
  reader: 'Reader',
  editor: 'Editor',
  super_admin: 'Super Admin',
  revoked: 'Revoked',
}

function badgeVariant(role: AppRole): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (role === 'super_admin') return 'default'
  if (role === 'pending') return 'secondary'
  if (role === 'revoked') return 'destructive'
  return 'outline'
}

export function UsersTable({ initialUsers }: { initialUsers: AppUser[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null)

  async function changeRole(email: string, role: AppRole) {
    setUpdatingEmail(email)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not update role')
      }
      const updated: AppUser = await response.json()
      setUsers((all) => all.map((u) => (u.email === updated.email ? updated : u)))
      toast.success(`${email} is now ${ROLE_LABELS[updated.role]}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update role')
    } finally {
      setUpdatingEmail(null)
    }
  }

  const sorted = [...users].sort((a, b) => (a.role === 'pending' ? -1 : b.role === 'pending' ? 1 : 0))

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Set role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((user) => (
            <TableRow key={user.email}>
              <TableCell className="text-sm">{user.email}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{user.display_name ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={badgeVariant(user.role)}>{ROLE_LABELS[user.role]}</Badge>
              </TableCell>
              <TableCell>
                <Select
                  value={user.role}
                  onValueChange={(value: AppRole | null) => value && changeRole(user.email, value)}
                  disabled={updatingEmail === user.email}
                >
                  <SelectTrigger size="sm" className="w-40" aria-label={`Change role for ${user.email}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reader">Reader</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="revoked">Revoked</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                No one has signed in yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
