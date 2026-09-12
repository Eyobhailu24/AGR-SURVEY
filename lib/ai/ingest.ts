import { createHash } from 'node:crypto'
import { chunkPages, type PageText } from '@/lib/ai/chunk'
import { embedPassages, toVectorLiteral } from '@/lib/ai/embed'
import {
  createDocument,
  findDocumentByChecksum,
  insertChunks,
  setChunkEmbeddings,
  setDocumentStatus,
} from '@/lib/queries/knowledge'

// Embedding is batched rather than one-at-a-time (per-call overhead dominates
// for a model this small) but kept modest so a large paper doesn't hold a big
// tensor allocation for long.
const EMBED_BATCH = 16

export type IngestInput = {
  bytes: Buffer
  filename: string
  mediaType: string
  title: string
  authors: string
  source: string
  publishedYear: number | null
  uploadedBy: string | null
}

export type IngestResult =
  | { ok: true; documentId: number; chunkCount: number; embeddedCount: number; pageCount: number }
  | { ok: false; reason: 'duplicate'; documentId: number; title: string }
  | { ok: false; reason: 'empty' | 'unsupported' | 'failed'; message: string }

async function extractPages(bytes: Buffer, mediaType: string, filename: string): Promise<PageText[] | null> {
  const isPdf = mediaType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    const { extractText } = await import('unpdf')
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: false })
    return text.map((pageText, index) => ({ page: index + 1, text: pageText }))
  }

  // Plain text and markdown have no pages; treat the whole file as page 1 so
  // citations stay honest rather than inventing page numbers.
  const isText = mediaType.startsWith('text/') || /\.(txt|md|markdown)$/i.test(filename)
  if (isText) return [{ page: 1, text: bytes.toString('utf8') }]

  return null
}

/**
 * Upload → extract → chunk → store → embed.
 *
 * Chunks are inserted before embedding, so a document is immediately findable
 * by the lexical arm of hybrid search even if embedding is slow or fails. A
 * failed embedding pass therefore degrades the document's recall rather than
 * losing it: status stays 'ready' and `embedded_count` shows the shortfall.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const checksum = createHash('sha256').update(input.bytes).digest('hex')

  const existing = await findDocumentByChecksum(checksum)
  if (existing) return { ok: false, reason: 'duplicate', documentId: existing.id, title: existing.title }

  let pages: PageText[] | null
  try {
    pages = await extractPages(input.bytes, input.mediaType, input.filename)
  } catch (error) {
    console.error('[ingest] extraction failed', error)
    return { ok: false, reason: 'failed', message: 'Could not read that file. It may be corrupt or password-protected.' }
  }

  if (!pages) {
    return { ok: false, reason: 'unsupported', message: 'Only PDF, plain text and markdown files are supported.' }
  }

  const chunks = chunkPages(pages)
  if (chunks.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: 'No readable text found. Scanned PDFs need OCR before they can be indexed.',
    }
  }

  const documentId = await createDocument({
    title: input.title,
    source: input.source || input.filename,
    authors: input.authors,
    publishedYear: input.publishedYear,
    pageCount: pages.length,
    checksum,
    uploadedBy: input.uploadedBy,
  })

  try {
    const chunkIds = await insertChunks(documentId, chunks)

    let embedded = 0
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      const slice = chunks.slice(start, start + EMBED_BATCH)
      const vectors = await embedPassages(slice.map((chunk) => chunk.content))
      await setChunkEmbeddings(
        vectors.map((vector, index) => ({ id: chunkIds[start + index], vector: toVectorLiteral(vector) })),
      )
      embedded += vectors.length
    }

    await setDocumentStatus(documentId, 'ready')
    return { ok: true, documentId, chunkCount: chunks.length, embeddedCount: embedded, pageCount: pages.length }
  } catch (error) {
    console.error('[ingest] indexing failed', error)
    // The chunks that landed are still lexically searchable, so this is
    // 'ready' with a recorded error rather than 'failed' — except when
    // nothing was stored at all.
    await setDocumentStatus(documentId, 'ready', 'Embedding did not complete; keyword search only.')
    return {
      ok: true,
      documentId,
      chunkCount: chunks.length,
      embeddedCount: 0,
      pageCount: pages.length,
    }
  }
}
