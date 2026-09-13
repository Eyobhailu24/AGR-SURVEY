'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { AddSidebarDialog } from '@/components/add-sidebar-dialog'
import { SidebarConfigForm, sidebarToDraft, type SidebarFormPayload } from '@/components/sidebar-config-form'
import { cn } from '@/lib/utils'
import type { Sidebar } from '@/lib/queries/sidebars'

export function SidebarsManager({ sidebars }: { sidebars: Sidebar[] }) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Sidebar | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function saveEdit(sidebar: Sidebar, payload: SidebarFormPayload) {
    setSaving(true)
    try {
      const response = await fetch(`/api/sidebars/${sidebar.slug}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save sidebar')
      }
      toast.success(`"${payload.name}" updated`)
      setEditingId(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save sidebar')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/sidebars/${deleteTarget.slug}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not delete sidebar')
      }
      toast.success(`"${deleteTarget.name}" deleted`)
      if (editingId === deleteTarget.id) setEditingId(null)
      // Re-runs the (app) layout's listSidebars(), so both this list and the
      // navigation drop the sidebar without a full reload.
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete sidebar')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus data-icon="inline-start" />
          Add sidebar
        </Button>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {sidebars.map((sidebar) => {
          const editing = editingId === sidebar.id
          return (
            <li key={sidebar.id}>
              <div className="flex items-center gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-sm font-semibold uppercase">
                  {sidebar.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/s/${sidebar.slug}`} className="truncate font-medium hover:underline">
                      {sidebar.name}
                    </Link>
                    <Badge variant={sidebar.notes_only ? 'secondary' : 'outline'}>
                      {sidebar.notes_only
                        ? 'Text records only'
                        : `${sidebar.column_schema.length} column${sidebar.column_schema.length === 1 ? '' : 's'}`}
                    </Badge>
                  </div>
                  {sidebar.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{sidebar.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={editing ? 'secondary' : 'outline'}
                  aria-expanded={editing}
                  aria-controls={`edit-sidebar-${sidebar.id}`}
                  onClick={() => setEditingId(editing ? null : sidebar.id)}
                >
                  <Pencil data-icon="inline-start" />
                  {editing ? 'Close' : 'Edit'}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${sidebar.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(sidebar)}
                >
                  <Trash2 />
                </Button>
              </div>
              {editing && (
                <div
                  id={`edit-sidebar-${sidebar.id}`}
                  className={cn('border-t border-border bg-muted/30 p-4')}
                >
                  <SidebarConfigForm
                    mode="edit"
                    initial={sidebarToDraft(sidebar)}
                    submitting={saving}
                    onSubmit={(payload) => saveEdit(sidebar, payload)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </li>
          )
        })}
        {sidebars.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">No sidebars yet.</li>
        )}
      </ul>

      <AddSidebarDialog open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the navigation for everyone and its page stops opening. The findings and text
              records already saved in it are kept in the database, not erased.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
