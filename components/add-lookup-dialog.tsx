'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LookupRow } from '@/lib/queries/lookups'

export function AddLookupDialog({
  open,
  onOpenChange,
  kind,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'sample_type' | 'measurement_type'
  onCreated: (row: LookupRow) => void
}) {
  const [label, setLabel] = useState('')
  const [unit, setUnit] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!label.trim()) {
      toast.error('Enter a name')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/lookups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, label, unit: kind === 'measurement_type' ? unit : undefined }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not create')
      }
      const row = await response.json()
      onCreated(row)
      toast.success(`"${row.label}" added`)
      onOpenChange(false)
      setLabel('')
      setUnit('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind === 'sample_type' ? 'New sample type' : 'New measurement type'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lookup-label">Name</Label>
            <Input id="lookup-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Soil" />
          </div>
          {kind === 'measurement_type' && (
            <div className="grid gap-1.5">
              <Label htmlFor="lookup-unit">Unit (optional)</Label>
              <Input id="lookup-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mg/kg" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
