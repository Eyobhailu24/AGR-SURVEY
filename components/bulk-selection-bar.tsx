'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// The strip that appears above a list once rows are ticked — shared by the
// findings table and the text-records cards.
export function BulkSelectionBar({
  count,
  noun,
  onClear,
  onDelete,
  children,
}: {
  count: number
  noun: [singular: string, plural: string]
  onClear: () => void
  onDelete: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
    >
      <span className="font-medium">
        {count} {count === 1 ? noun[0] : noun[1]} selected
      </span>
      {children}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear selection
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 data-icon="inline-start" />
          Delete selected
        </Button>
      </div>
    </div>
  )
}
