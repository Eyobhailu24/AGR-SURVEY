'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Trash2, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { formatDateDisplay } from '@/lib/utils'
import type { KnowledgeDocument } from '@/lib/queries/knowledge'

export function DocumentsWorkspace({
  initialDocuments,
  canManage,
}: {
  initialDocuments: KnowledgeDocument[]
  canManage: boolean
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<KnowledgeDocument | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function refresh() {
    const res = await fetch('/api/ai/documents')
    if (res.ok) setDocuments((await res.json()).documents)
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      toast.error('Choose a file first.')
      return
    }

    setUploading(true)
    try {
      const res = await fetch('/api/ai/documents', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed.')
        return
      }
      const partial = data.embeddedCount === 0 && data.chunkCount > 0
      toast.success(
        `Indexed ${data.chunkCount} passages from ${data.pageCount} page(s).` +
          (partial ? ' Keyword search only — embedding did not complete.' : ''),
      )
      formRef.current?.reset()
      await refresh()
    } catch {
      toast.error('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const doc = pendingDelete
    setPendingDelete(null)
    const res = await fetch(`/api/ai/documents/${doc.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Could not remove that document.')
      return
    }
    toast.success(`Removed "${doc.title}".`)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <form
          ref={formRef}
          onSubmit={upload}
          className="rounded-xl border border-border bg-card p-5"
        >
          <p className="mb-1 font-serif text-base font-semibold">Add a reference document</p>
          <p className="mb-4 text-sm text-muted-foreground">
            PDF, plain text or markdown, up to 20MB. Text is extracted, split into passages and indexed for
            both keyword and meaning-based search. Only upload sources you have approved — the assistant will
            cite them.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" required />
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Defaults to the filename" />
            </div>
            <div>
              <Label htmlFor="authors">Authors</Label>
              <Input id="authors" name="authors" placeholder="e.g. Smith, J." />
            </div>
            <div>
              <Label htmlFor="publishedYear">Year</Label>
              <Input id="publishedYear" name="publishedYear" inputMode="numeric" placeholder="e.g. 2019" />
            </div>
            <div>
              <Label htmlFor="source">Source</Label>
              <Input id="source" name="source" placeholder="DOI, journal or URL" />
            </div>
          </div>

          <Button type="submit" className="mt-4" disabled={uploading}>
            <Upload data-icon="inline-start" />
            {uploading ? 'Indexing…' : 'Upload and index'}
          </Button>
          {uploading && (
            <p className="mt-2 text-xs text-muted-foreground">
              Large PDFs can take a minute — text extraction and embedding both run on the server.
            </p>
          )}
        </form>
      )}

      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Indexed</TableHead>
              <TableHead>Added</TableHead>
              {canManage && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                  No reference documents yet. The assistant will answer scientific questions from general
                  knowledge and cite nothing until something is added here.
                </TableCell>
              </TableRow>
            )}
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="font-medium">{doc.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[doc.authors, doc.source].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{doc.published_year ?? '—'}</TableCell>
                <TableCell>{doc.page_count ?? '—'}</TableCell>
                <TableCell>
                  {/* Embedded < chunks means the semantic arm is incomplete for
                      this document — it is still found by keyword search. */}
                  {doc.embedded_count === doc.chunk_count ? (
                    <Badge variant="outline">{doc.chunk_count} passages</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {doc.embedded_count}/{doc.chunk_count} embedded
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateDisplay(String(doc.created_at).slice(0, 10))}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${doc.title}`}
                      onClick={() => setPendingDelete(doc)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; and all {pendingDelete?.chunk_count} of its indexed passages
              will be deleted. The assistant will stop citing it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
