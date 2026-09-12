import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { recordAudit } from '@/lib/audit'
import { ingestDocument } from '@/lib/ai/ingest'
import { listDocuments } from '@/lib/queries/knowledge'

// Extraction, chunking and embedding a whole paper takes far longer than a
// chat turn. The platform may cap this lower than requested — a long PDF that
// times out leaves its already-inserted chunks keyword-searchable rather than
// losing the upload entirely (see lib/ai/ingest.ts).
export const maxDuration = 300

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** Anyone who can read the research data can see what is in the library. */
export async function GET() {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ documents: await listDocuments() })
}

/**
 * Ingestion is super_admin only: anything added here becomes a source the
 * assistant will cite to every user, so it is deliberately a narrower
 * permission than editing measurements.
 */
export async function POST(request: Request) {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok || !ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Files must be 20MB or smaller.' }, { status: 413 })
  }

  const title = String(form.get('title') ?? '').trim() || file.name
  const authors = String(form.get('authors') ?? '').trim()
  const source = String(form.get('source') ?? '').trim()
  const yearRaw = String(form.get('publishedYear') ?? '').trim()
  const publishedYear = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null

  try {
    const result = await ingestDocument({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mediaType: file.type || 'application/octet-stream',
      title,
      authors,
      source,
      publishedYear,
      uploadedBy: ctx.email,
    })

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        return NextResponse.json(
          { error: `Already in the library as "${result.title}".`, documentId: result.documentId },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'knowledge.document.create',
      entityType: 'document',
      entityId: result.documentId,
      diff: { title, chunkCount: result.chunkCount, embeddedCount: result.embeddedCount, pageCount: result.pageCount },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[ai/documents] ingest failed', error)
    return NextResponse.json({ error: 'Could not index that document.' }, { status: 500 })
  }
}
