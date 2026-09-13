'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { RichTextEditor } from '@/components/rich-text-editor'
import { ImportTextDialog } from '@/components/import-text-dialog'
import { ExportMenu } from '@/components/export-menu'
import { BulkSelectionBar } from '@/components/bulk-selection-bar'
import { cn, formatDateDisplay } from '@/lib/utils'
import type { TextRecord } from '@/lib/queries/text-records'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function TextRecordsPanel({ apiBase, slug, canEdit }: { apiBase: string; slug: string; canEdit: boolean }) {
  const [records, setRecords] = useState<TextRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [formOriginalDate, setFormOriginalDate] = useState<string | null>(null)
  const [formDate, setFormDate] = useState(todayISO())
  const [formBody, setFormBody] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TextRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dir })
      if (dateFromFilter) params.set('dateFrom', dateFromFilter)
      if (dateToFilter) params.set('dateTo', dateToFilter)
      const response = await fetch(`${apiBase}/text-records?${params}`)
      if (!response.ok) throw new Error('Could not load text records')
      setRecords(await response.json())
    } catch {
      toast.error('Could not load text records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // A different set of cards is about to show — don't carry ticks over to it.
    setSelectedIds(new Set())
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, dir, dateFromFilter, dateToFilter])

  function openNew() {
    const existingToday = records.find((r) => r.record_date === todayISO())
    setFormOriginalDate(null)
    setFormDate(todayISO())
    setFormBody(existingToday?.body ?? '')
    setFormOpen(true)
  }
  function openEdit(record: TextRecord) {
    setFormOriginalDate(record.record_date)
    setFormDate(record.record_date)
    setFormBody(record.body)
    setFormOpen(true)
  }
  function handleDateChange(next: string) {
    setFormDate(next)
    // Only one record per day — if a record already exists for the date
    // just typed/picked, load it instead of silently overwriting it on save.
    const existing = records.find((r) => r.record_date === next)
    setFormBody(existing?.body ?? '')
  }

  async function save() {
    if (!formDate) {
      toast.error('Pick a date')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`${apiBase}/text-records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ record_date: formDate, body: formBody }),
      })
      if (!response.ok) throw new Error('Save failed')
      toast.success(`Text record for ${formDate} saved`)
      setFormOpen(false)
      await load()
    } catch {
      toast.error('Could not save this text record')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await fetch(`${apiBase}/text-records/${deleteTarget.record_date}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Delete failed')
      toast.success('Text record deleted')
      setRecords((all) => all.filter((r) => r.record_date !== deleteTarget.record_date))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
    } catch {
      toast.error('Could not delete this text record')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const allSelected = records.length > 0 && records.every((r) => selectedIds.has(r.id))
  const someSelected = records.some((r) => selectedIds.has(r.id))

  async function confirmBulkDelete() {
    const ids = [...selectedIds]
    setBulkDeleting(true)
    try {
      const response = await fetch(`${apiBase}/text-records`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not delete the selected text records')
      toast.success(`${body.deletedCount} text record${body.deletedCount === 1 ? '' : 's'} deleted`)
      const deletedIds = new Set(ids)
      setRecords((all) => all.filter((r) => !deletedIds.has(r.id)))
      setSelectedIds(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the selected text records')
    } finally {
      setBulkDeleting(false)
      setBulkDeleteOpen(false)
    }
  }

  // Only one record per day: if the date currently in the form matches some
  // *other* record than the one we started from, saving will silently
  // overwrite that record instead of creating a new one — worth flagging.
  const collidingRecord = records.find((r) => r.record_date === formDate && r.record_date !== formOriginalDate)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-xl font-semibold">Text records</h3>
        <div className="flex items-center gap-2">
          <ExportMenu
            kind="text-records"
            apiBase={apiBase}
            slug={slug}
            dir={dir}
            dateFrom={dateFromFilter}
            dateTo={dateToFilter}
          />
          {canEdit && (
            <Button size="sm" onClick={openNew}>
              <Plus data-icon="inline-start" />
              Add note
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Sort by</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          >
            {dir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {dir === 'asc' ? 'Oldest first' : 'Newest first'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Date</span>
          <input
            type="date"
            aria-label="From date"
            className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
            value={dateFromFilter}
            max={dateToFilter || undefined}
            onChange={(e) => setDateFromFilter(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="To date"
            className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
            value={dateToFilter}
            min={dateFromFilter || undefined}
            onChange={(e) => setDateToFilter(e.target.value)}
          />
          {(dateFromFilter || dateToFilter) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear date filter"
              onClick={() => {
                setDateFromFilter('')
                setDateToFilter('')
              }}
            >
              ×
            </Button>
          )}
        </div>
        {canEdit && records.length > 0 && (
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected && !allSelected
              }}
              onChange={(e) => setSelectedIds(e.target.checked ? new Set(records.map((r) => r.id)) : new Set())}
            />
            Select all
          </label>
        )}
      </div>

      {canEdit && selectedIds.size > 0 && (
        <BulkSelectionBar
          count={selectedIds.size}
          noun={['text record', 'text records']}
          onClear={() => setSelectedIds(new Set())}
          onDelete={() => setBulkDeleteOpen(true)}
        />
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No text records yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => {
            const selected = selectedIds.has(record.id)
            return (
              <div
                key={record.record_date}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border border-border bg-card p-4',
                  selected && 'border-primary/50 ring-2 ring-primary/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`Select the record for ${formatDateDisplay(record.record_date)}`}
                        checked={selected}
                        onChange={(e) => toggleSelected(record.id, e.target.checked)}
                      />
                    )}
                    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      {formatDateDisplay(record.record_date)}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => openEdit(record)}>
                        <Pencil />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Delete" onClick={() => setDeleteTarget(record)}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                <div
                  className="prose prose-sm dark:prose-invert max-h-48 max-w-none overflow-hidden text-sm *:first:mt-0 *:last:mb-0"
                  dangerouslySetInnerHTML={{ __html: record.body || '<p class="text-muted-foreground">Empty</p>' }}
                />
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formOriginalDate ? 'Edit text record' : 'Add text record'}</DialogTitle>
            <DialogDescription>
              One record per day — picking a date that already has a record loads it for editing instead of making a
              duplicate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="date"
                aria-label="Record date"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={formDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
              {collidingRecord && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  This date already has a record — saving will update it, not create a new one.
                </span>
              )}
              <ImportTextDialog date={formDate} onImport={setFormBody} />
            </div>
            <RichTextEditor value={formBody} onChange={setFormBody} editable />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this text record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `The record for ${formatDateDisplay(deleteTarget.record_date)} will be permanently removed. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !bulkDeleting && setBulkDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} text record{selectedIds.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The selected records will be permanently removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
