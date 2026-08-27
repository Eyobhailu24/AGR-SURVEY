'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ColumnField } from '@/lib/queries/sidebars'

type DraftColumn = ColumnField & { _id: string }

function emptyColumn(): DraftColumn {
  return { _id: crypto.randomUUID(), key: '', label: '', type: 'text' }
}

export function AddSidebarDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [includesTextRecord, setIncludesTextRecord] = useState(true)
  const [notesOnly, setNotesOnly] = useState(false)
  const [columns, setColumns] = useState<DraftColumn[]>([emptyColumn()])
  const [submitting, setSubmitting] = useState(false)

  function updateColumn(id: string, patch: Partial<DraftColumn>) {
    setColumns((all) => all.map((c) => (c._id === id ? { ...c, ...patch } : c)))
  }
  function removeColumn(id: string) {
    setColumns((all) => (all.length > 1 ? all.filter((c) => c._id !== id) : all))
  }
  function reset() {
    setName('')
    setDescription('')
    setIncludesTextRecord(true)
    setNotesOnly(false)
    setColumns([emptyColumn()])
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Give the sidebar a name')
      return
    }
    const columnSchema: ColumnField[] = columns
      .filter((c) => c.key.trim() && c.label.trim())
      .map(({ _id, ...rest }) => rest)

    setSubmitting(true)
    try {
      const response = await fetch('/api/sidebars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, includesTextRecord, notesOnly, columnSchema }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not create sidebar')
      }
      const sidebar = await response.json()
      toast.success(`"${sidebar.name}" added`)
      onOpenChange(false)
      reset()
      router.push(`/s/${sidebar.slug}`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create sidebar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a sidebar</DialogTitle>
          <DialogDescription>
            Name it, decide what it tracks, and it appears as a new page immediately — no restart needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sidebar-name">Name</Label>
            <Input
              id="sidebar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Phosphorus lab test"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sidebar-description">Description (optional)</Label>
            <Textarea
              id="sidebar-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Text records only</p>
              <p className="text-xs text-muted-foreground">
                A dated notes page with no findings table — e.g. a general journal that isn&apos;t tied to a specific
                test.
              </p>
            </div>
            <Switch checked={notesOnly} onCheckedChange={setNotesOnly} />
          </div>

          {!notesOnly && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Include a text record</p>
                <p className="text-xs text-muted-foreground">A rich-text note per day, separate from per-row notes.</p>
              </div>
              <Switch checked={includesTextRecord} onCheckedChange={setIncludesTextRecord} />
            </div>
          )}

          {!notesOnly && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Measurement columns</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setColumns((all) => [...all, emptyColumn()])}
                >
                  <Plus data-icon="inline-start" />
                  Add column
                </Button>
              </div>
              {columns.map((column) => (
                <div key={column._id} className="flex items-center gap-2">
                  <Input
                    aria-label="Column key"
                    placeholder="key (e.g. NO3)"
                    className="w-28"
                    value={column.key}
                    onChange={(e) => updateColumn(column._id, { key: e.target.value })}
                  />
                  <Input
                    aria-label="Column label"
                    placeholder="label"
                    value={column.label}
                    onChange={(e) => updateColumn(column._id, { label: e.target.value })}
                  />
                  <Select
                    value={column.type}
                    onValueChange={(value: ColumnField['type'] | null) => value && updateColumn(column._id, { type: value })}
                  >
                    <SelectTrigger className="w-28" aria-label="Column type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="select">Choice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove column"
                    onClick={() => removeColumn(column._id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add sidebar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
