'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
import type { Sidebar } from '@/lib/queries/sidebars'

export function SidebarsManager({ sidebars }: { sidebars: Sidebar[] }) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Sidebar | null>(null)
  const [deleting, setDeleting] = useState(false)

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
        {sidebars.map((sidebar) => (
          <li key={sidebar.id} className="flex items-center gap-3 p-4">
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
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${sidebar.name}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteTarget(sidebar)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
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
