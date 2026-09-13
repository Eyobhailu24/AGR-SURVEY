'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SidebarConfigForm, emptySidebarDraft, type SidebarFormPayload } from '@/components/sidebar-config-form'

export function AddSidebarDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(payload: SidebarFormPayload) {
    setSubmitting(true)
    try {
      const response = await fetch('/api/sidebars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Could not create sidebar')
      }
      const sidebar = await response.json()
      toast.success(`"${sidebar.name}" added`)
      onOpenChange(false)
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
      {/* sm:max-w-* is what actually widens it — DialogContent sets sm:max-w-sm by default. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a sidebar</DialogTitle>
          <DialogDescription>
            Name it, add the columns it tracks, then choose which of those columns its table can be sorted and
            filtered by.
          </DialogDescription>
        </DialogHeader>
        <SidebarConfigForm
          mode="create"
          initial={emptySidebarDraft()}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
