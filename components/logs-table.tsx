'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AuditEntry } from '@/lib/queries/audit'

const PAGE_SIZE = 50

function formatWhen(value: string) {
  return new Date(value).toLocaleString()
}

export function LogsTable({ initialEntries }: { initialEntries: AuditEntry[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(initialEntries.length < PAGE_SIZE)

  async function loadMore() {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ beforeCreatedAt: last.created_at, beforeId: String(last.id) })
      const response = await fetch(`/api/logs?${params}`)
      const more: AuditEntry[] = await response.json()
      setEntries((all) => [...all, ...more])
      if (more.length < PAGE_SIZE) setExhausted(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatWhen(entry.created_at)}
                </TableCell>
                <TableCell className="text-sm">{entry.actor_name ?? entry.actor_email ?? 'system'}</TableCell>
                <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {entry.entity_type}
                  {entry.entity_id ? ` #${entry.entity_id}` : ''}
                </TableCell>
                <TableCell
                  className="max-w-md truncate text-xs text-muted-foreground"
                  title={entry.diff ? JSON.stringify(entry.diff) : undefined}
                >
                  {entry.diff ? JSON.stringify(entry.diff) : '—'}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                  Nothing logged yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!exhausted && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="self-center">
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
