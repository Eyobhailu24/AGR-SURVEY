'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ExportFormat = 'csv' | 'xlsx' | 'docx' | 'google-sheet' | 'google-doc'

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel (.xlsx)',
  docx: 'Word (.docx)',
  'google-sheet': 'Google Sheet',
  'google-doc': 'Google Doc',
}

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  csv: 'csv',
  xlsx: 'xlsx',
  docx: 'docx',
  'google-sheet': '',
  'google-doc': '',
}

// The server maps format -> data source the same way (see
// app/api/sidebars/[slug]/export/route.ts): CSV/Excel/Google Sheet always
// export the findings grid, Word/Google Doc always export the text records.
// Each trigger only offers the formats that match what it's exporting.
const FORMATS_BY_KIND: Record<'findings' | 'text-records', ExportFormat[]> = {
  findings: ['csv', 'xlsx', 'google-sheet'],
  'text-records': ['docx', 'google-doc'],
}

export function ExportMenu({
  kind,
  apiBase,
  slug,
  sort,
  dir,
  sampleTypeId,
  measurementTypeId,
  dateFrom,
  dateTo,
  hasActiveFilter,
}: {
  kind: 'findings' | 'text-records'
  apiBase: string
  slug: string
  sort?: string
  dir: string
  sampleTypeId?: string
  measurementTypeId?: string
  dateFrom?: string
  dateTo?: string
  hasActiveFilter?: boolean
}) {
  const formats = FORMATS_BY_KIND[kind]
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>(formats[0])
  const [scope, setScope] = useState<'view' | 'all'>('view')
  const [exporting, setExporting] = useState(false)

  async function runExport() {
    setExporting(true)
    try {
      const response = await fetch(`${apiBase}/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          format,
          scope,
          sort,
          dir,
          sampleTypeId: kind === 'findings' && scope === 'view' ? sampleTypeId || undefined : undefined,
          measurementTypeId: kind === 'findings' && scope === 'view' ? measurementTypeId || undefined : undefined,
          dateFrom: kind === 'text-records' || scope === 'view' ? dateFrom || undefined : undefined,
          dateTo: kind === 'text-records' || scope === 'view' ? dateTo || undefined : undefined,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Export failed')
      }

      if (format === 'google-sheet' || format === 'google-doc') {
        const { url } = await response.json()
        toast.success('Export ready in Google Drive', {
          action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') },
        })
      } else {
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        const suffix = kind === 'text-records' ? '-text-records' : ''
        a.download = `${slug}${suffix}.${FILE_EXTENSIONS[format]}`
        a.click()
        URL.revokeObjectURL(objectUrl)
        toast.success(`${FORMAT_LABELS[format]} downloaded`)
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const title = kind === 'findings' ? 'Export findings' : 'Export text records'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
        <Download data-icon="inline-start" />
        {kind === 'findings' ? 'Export' : 'Export text'}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === 'findings'
              ? 'Choose a format and how much data to include.'
              : `Choose a format. Records are ordered by date, ${dir === 'asc' ? 'oldest first' : 'newest first'} — matching the list's current order.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="export-format">Format</Label>
            <Select value={format} onValueChange={(v: ExportFormat | null) => v && setFormat(v)}>
              <SelectTrigger id="export-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === 'findings' && (
            <div className="grid gap-1.5">
              <Label htmlFor="export-scope">Scope</Label>
              <Select value={scope} onValueChange={(v: 'view' | 'all' | null) => v && setScope(v)}>
                <SelectTrigger id="export-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Current view{hasActiveFilter ? ' (matches your filters)' : ''}</SelectItem>
                  <SelectItem value="all">Entire table</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={runExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
