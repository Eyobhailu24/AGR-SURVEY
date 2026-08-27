'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Sidebar } from '@/lib/queries/sidebars'

type TargetField = { key: string; label: string }

function targetFields(sidebar: Sidebar): TargetField[] {
  return [
    { key: 'finding_date', label: 'Date (required, YYYY-MM-DD)' },
    { key: 'sample_id', label: 'Sample' },
    { key: 'sample_type_label', label: 'Sample type' },
    { key: 'measurement_type_label', label: 'Measurement type' },
    { key: 'measurement_group', label: 'Group' },
    ...sidebar.column_schema.map((c) => ({ key: `values.${c.key}`, label: c.label })),
    { key: 'apparatus', label: 'Apparatus' },
    { key: 'notes', label: 'Notes' },
  ]
}

function setPath(obj: Record<string, unknown>, path: string, value: string) {
  if (path.startsWith('values.')) {
    const key = path.slice('values.'.length)
    obj.values = { ...((obj.values as Record<string, string>) ?? {}), [key]: value }
  } else {
    obj[path] = value
  }
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type PreviewResult = { index: number; ok: boolean; errors?: string[] }
type PreviewResponse = { validCount: number; invalidCount: number; results: PreviewResult[] }

export function ImportCsvDialog({
  sidebar,
  apiBase,
  onImported,
}: {
  sidebar: Sidebar
  apiBase: string
  onImported: () => void
}) {
  const [open, setOpen] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<'select' | 'preview'>('select')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const fields = targetFields(sidebar)

  function reset() {
    setHeaders([])
    setCsvRows([])
    setMapping({})
    setPhase('select')
    setPreview(null)
  }

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const cols = result.meta.fields ?? []
        setHeaders(cols)
        setCsvRows(result.data)
        const auto: Record<string, string> = {}
        for (const field of fields) {
          const targetName = normalize(field.key.replace('values.', ''))
          const guess = cols.find((h) => normalize(h) === targetName)
          if (guess) auto[field.key] = guess
        }
        setMapping(auto)
      },
      error: () => toast.error('Could not read that CSV file'),
    })
  }

  function buildMappedRows() {
    return csvRows.map((raw) => {
      const mapped: Record<string, unknown> = { values: {} }
      for (const field of fields) {
        const header = mapping[field.key]
        setPath(mapped, field.key, header ? raw[header] ?? '' : '')
      }
      return mapped
    })
  }

  async function runPreview() {
    setBusy(true)
    try {
      const response = await fetch(`${apiBase}/import/csv`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: buildMappedRows(), commit: false }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data)
      setPhase('preview')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  async function runCommit() {
    setBusy(true)
    try {
      const response = await fetch(`${apiBase}/import/csv`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: buildMappedRows(), commit: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Import failed')
      toast.success(`Imported ${data.insertedCount} finding${data.insertedCount === 1 ? '' : 's'}`)
      setOpen(false)
      reset()
      onImported()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
        <Upload data-icon="inline-start" />
        Import CSV
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import findings from CSV</DialogTitle>
          <DialogDescription>
            {phase === 'select'
              ? "Upload a CSV, then match its columns to this sidebar's fields."
              : `${preview?.validCount ?? 0} row(s) ready to import, ${preview?.invalidCount ?? 0} will be skipped.`}
          </DialogDescription>
        </DialogHeader>

        {phase === 'select' && (
          <div className="flex flex-col gap-4">
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="text-sm"
            />
            {headers.length > 0 && (
              <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1">
                {fields.map((field) => (
                  <div key={field.key} className="grid gap-1">
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={mapping[field.key] || '__none__'}
                      onValueChange={(v: string | null) =>
                        setMapping((all) => ({ ...all, [field.key]: v && v !== '__none__' ? v : '' }))
                      }
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Not mapped —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{csvRows.length} row(s) detected.</p>
          </div>
        )}

        {phase === 'preview' && preview && (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.results.map((r) => (
                  <TableRow key={r.index}>
                    <TableCell className="text-xs">{r.index + 1}</TableCell>
                    <TableCell className="text-xs">
                      {r.ok ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Ready</span>
                      ) : (
                        <span className="text-destructive">{(r.errors ?? []).join('; ')}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          {phase === 'preview' && (
            <Button variant="outline" onClick={() => setPhase('select')}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {phase === 'select' ? (
            <Button onClick={runPreview} disabled={busy || csvRows.length === 0}>
              {busy ? 'Checking…' : 'Preview'}
            </Button>
          ) : (
            <Button onClick={runCommit} disabled={busy || !preview?.validCount}>
              {busy ? 'Importing…' : `Import ${preview?.validCount ?? 0} row(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
