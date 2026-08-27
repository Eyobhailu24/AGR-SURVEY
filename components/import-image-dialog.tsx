'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ImageUp } from 'lucide-react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Sidebar } from '@/lib/queries/sidebars'

type PreviewResult = { index: number; ok: boolean; errors?: string[] }
type PreviewResponse = { validCount: number; invalidCount: number; results: PreviewResult[] }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ImportImageDialog({
  sidebar,
  apiBase,
  onImported,
}: {
  sidebar: Sidebar
  apiBase: string
  onImported: () => void
}) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [extractedRows, setExtractedRows] = useState<unknown[] | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setFile(null)
    setPreviewUrl(null)
    setExtractedRows(null)
    setPreview(null)
  }

  function handleFile(f: File) {
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setExtractedRows(null)
    setPreview(null)
  }

  async function runExtract() {
    if (!file) return
    setBusy(true)
    try {
      const imageBase64 = await fileToBase64(file)
      const response = await fetch(`${apiBase}/import/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType: file.type || 'image/jpeg' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Extraction failed')
      if (!data.rows?.length) {
        toast.error('No rows could be read from that image')
        return
      }
      setExtractedRows(data.rows)

      const previewResponse = await fetch(`${apiBase}/import/csv`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: data.rows, commit: false }),
      })
      const previewData = await previewResponse.json()
      if (!previewResponse.ok) throw new Error(previewData.error || 'Preview failed')
      setPreview(previewData)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Extraction failed')
    } finally {
      setBusy(false)
    }
  }

  async function runCommit() {
    if (!extractedRows) return
    setBusy(true)
    try {
      const response = await fetch(`${apiBase}/import/csv`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: extractedRows, commit: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Import failed')
      toast.success(`Imported ${data.insertedCount} finding${data.insertedCount === 1 ? '' : 's'} from photo`)
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
        <ImageUp data-icon="inline-start" />
        Import from photo
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from a notebook photo</DialogTitle>
          <DialogDescription>
            Upload a photo of a handwritten page. An AI model reads it into rows for {sidebar.name} — always review
            before importing, handwriting extraction isn&apos;t perfect.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <input
            type="file"
            accept="image/*"
            aria-label="Notebook photo"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="text-sm"
          />
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Selected notebook page"
              className="max-h-48 rounded-lg border border-border object-contain"
            />
          )}
          {preview && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
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
          <p className="text-xs text-muted-foreground">
            {preview
              ? `${preview.validCount} row(s) ready, ${preview.invalidCount} will be skipped.`
              : "Uses the AI Gateway — extraction may take a few seconds and applies your account's usage."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {!preview ? (
            <Button onClick={runExtract} disabled={busy || !file}>
              {busy ? 'Reading photo…' : 'Extract data'}
            </Button>
          ) : (
            <Button onClick={runCommit} disabled={busy || !preview.validCount}>
              {busy ? 'Importing…' : `Import ${preview.validCount} row(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
