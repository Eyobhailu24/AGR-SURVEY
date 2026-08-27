'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<AppRole>('reader')
  const [adding, setAdding] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  async function addUser() {
    if (!newEmail.trim()) {
      toast.error('Enter an email address')
      return
    }
    setAdding(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), displayName: newName.trim() || null, role: newRole }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not add user')
      }
      const created: AppUser = await response.json()
      setUsers((all) => [created, ...all])
      toast.success(`${created.email} added as ${ROLE_LABELS[created.role]}`)
      setAddOpen(false)
      setNewEmail('')
      setNewName('')
      setNewRole('reader')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add user')
    } finally {
      setAdding(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: deleteTarget.email }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not remove user')
      }
      setUsers((all) => all.filter((u) => u.email !== deleteTarget.email))
      toast.success(`${deleteTarget.email} removed`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove user')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const sorted = [...users].sort((a, b) => (a.role === 'pending' ? -1 : b.role === 'pending' ? 1 : 0))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus data-icon="inline-start" />
          Add user
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Set role</TableHead>
              <TableHead className="w-10" />
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
                <TableCell>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${user.email}`}
                    onClick={() => setDeleteTarget(user)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                  No one has signed in yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Pre-approve someone before they sign in. When they sign in with Google using this email, they land
              directly at the role you set here instead of Pending.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="name@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-user-name">Name (optional)</Label>
              <Input id="new-user-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-user-role">Role</Label>
              <Select value={newRole} onValueChange={(value: AppRole | null) => value && setNewRole(value)}>
                <SelectTrigger id="new-user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reader">Reader</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addUser} disabled={adding}>
              {adding ? 'Adding…' : 'Add user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.email} loses access immediately. If they sign in again later with Google, they&apos;ll
              restart at Pending. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
