import { pool } from '@/lib/db'
import type { Chunk } from '@/lib/ai/chunk'

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed'

export type KnowledgeDocument = {
  id: number
  title: string
  source: string
  authors: string
  published_year: number | null
  page_count: number | null
  status: DocumentStatus
  error: string | null
  uploaded_by: string | null
  created_at: string
  chunk_count: number
  embedded_count: number
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const result = await pool.query<KnowledgeDocument & { chunk_count: string; embedded_count: string }>(
    `select d.id, d.title, d.source, d.authors, d.published_year, d.page_count, d.status, d.error,
            d.uploaded_by, d.created_at,
            count(c.id)::text as chunk_count,
            count(c.embedding)::text as embedded_count
     from documents d
     left join document_chunks c on c.document_id = d.id
     group by d.id
     order by d.created_at desc`,
  )
  // pg returns bigint (id) and count() as strings — normalise so callers can
  // rely on the declared numeric types.
  return result.rows.map((r) => ({
    ...r,
    id: Number(r.id),
    chunk_count: Number(r.chunk_count),
    embedded_count: Number(r.embedded_count),
  }))
}

/** Small summary for the system prompt: whether there is a library to search at all. */
export async function getKnowledgeSummary() {
  const result = await pool.query<{ documents: string; chunks: string; embedded: string }>(
    `select count(distinct d.id)::text as documents,
            count(c.id)::text as chunks,
            count(c.embedding)::text as embedded
     from documents d
     left join document_chunks c on c.document_id = d.id
     where d.status = 'ready'`,
  )
  const row = result.rows[0]
  return {
    documents: Number(row?.documents ?? 0),
    chunks: Number(row?.chunks ?? 0),
    embedded: Number(row?.embedded ?? 0),
  }
}

export async function findDocumentByChecksum(checksum: string) {
  const result = await pool.query<{ id: number; title: string }>(
    'select id, title from documents where checksum = $1',
    [checksum],
  )
  const row = result.rows[0]
  return row ? { ...row, id: Number(row.id) } : null
}

export async function createDocument(input: {
  title: string
  source: string
  authors: string
  publishedYear: number | null
  pageCount: number | null
  checksum: string
  uploadedBy: string | null
}) {
  const result = await pool.query<{ id: number }>(
    `insert into documents (title, source, authors, published_year, page_count, checksum, uploaded_by, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'processing')
     returning id`,
    [
      input.title,
      input.source,
      input.authors,
      input.publishedYear,
      input.pageCount,
      input.checksum,
      input.uploadedBy,
    ],
  )
  return Number(result.rows[0].id)
}

export async function setDocumentStatus(id: number, status: DocumentStatus, error: string | null = null) {
  await pool.query('update documents set status = $2, error = $3, updated_at = now() where id = $1', [
    id,
    status,
    error,
  ])
}

export async function deleteDocument(id: number) {
  // Chunks cascade via the FK.
  await pool.query('delete from documents where id = $1', [id])
}

/** Bulk-insert chunks in one statement and return their ids in chunk order. */
export async function insertChunks(documentId: number, chunks: Chunk[]): Promise<number[]> {
  if (chunks.length === 0) return []

  const params: unknown[] = [documentId]
  const values = chunks.map((chunk, index) => {
    const base = params.length
    params.push(index, chunk.pageFrom, chunk.pageTo, chunk.heading, chunk.content, chunk.tokenCount)
    return `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
  })

  const result = await pool.query<{ id: number }>(
    `insert into document_chunks (document_id, chunk_index, page_from, page_to, heading, content, token_count)
     values ${values.join(', ')}
     returning id`,
    params,
  )
  return result.rows.map((r) => Number(r.id))
}

/** Attach embeddings to already-stored chunks, one statement per batch. */
export async function setChunkEmbeddings(rows: { id: number; vector: string }[]) {
  if (rows.length === 0) return

  const params: unknown[] = []
  const values = rows.map((row) => {
    params.push(row.id, row.vector)
    return `($${params.length - 1}::bigint, $${params.length}::vector)`
  })

  await pool.query(
    `update document_chunks c
     set embedding = v.embedding
     from (values ${values.join(', ')}) as v(id, embedding)
     where c.id = v.id`,
    params,
  )
}

export type KnowledgeHit = {
  chunkId: number
  documentId: number
  title: string
  authors: string
  source: string
  publishedYear: number | null
  heading: string
  content: string
  pageFrom: number | null
  pageTo: number | null
  score: number
  matchedBy: 'both' | 'keyword' | 'meaning'
}

// Reciprocal Rank Fusion constant from the original Cormack et al. paper.
// 60 damps the top of each list so a single arm can't dominate on rank alone.
const RRF_K = 60

/**
 * Hybrid retrieval: an exact-term arm and a meaning arm, fused by rank.
 *
 * The two arms produce incomparable scores — ts_rank_cd is unbounded and
 * corpus-dependent, cosine distance is [0,2] — so blending them numerically
 * would need weights that drift as the corpus grows. RRF discards the scores
 * and fuses positions instead, which needs no normalisation and no tuning.
 *
 * `queryVector` may be null (model still loading, or embedding failed): the
 * semantic arm is then skipped entirely and this degrades to lexical-only
 * rather than failing. `matchedBy` reports which arm(s) found each hit, which
 * is genuinely useful for judging whether the corpus is being searched well.
 */
export async function searchKnowledge(options: {
  query: string
  queryVector: string | null
  limit?: number
  poolSize?: number
}): Promise<KnowledgeHit[]> {
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 20)
  const poolSize = Math.min(Math.max(options.poolSize ?? 50, limit), 200)

  const params: unknown[] = [options.query, poolSize]
  const hasVector = options.queryVector !== null

  const lexicalCte = `
    lexical as (
      select id, row_number() over (order by score desc, id) as rank
      from (
        select c.id, ts_rank_cd(c.tsv, q) as score
        from document_chunks c
        join documents d on d.id = c.document_id and d.status = 'ready'
        cross join websearch_to_tsquery('english', $1) q
        where c.tsv @@ q
        order by score desc, c.id
        limit $2
      ) ranked
    )`

  let cteSql: string
  let fusedSql: string

  if (hasVector) {
    params.push(options.queryVector)
    const vectorParam = `$${params.length}`
    cteSql = `${lexicalCte},
    semantic as (
      select id, row_number() over (order by distance asc, id) as rank
      from (
        select c.id, c.embedding <=> ${vectorParam}::vector as distance
        from document_chunks c
        join documents d on d.id = c.document_id and d.status = 'ready'
        where c.embedding is not null
        order by distance asc
        limit $2
      ) ranked
    )`
    // full outer join: a chunk found by only one arm must still score.
    fusedSql = `
    select coalesce(l.id, s.id) as id,
           coalesce(1.0 / (${RRF_K} + l.rank), 0) + coalesce(1.0 / (${RRF_K} + s.rank), 0) as score,
           case when l.id is not null and s.id is not null then 'both'
                when l.id is not null then 'keyword'
                else 'meaning' end as matched_by
    from lexical l
    full outer join semantic s on l.id = s.id`
  } else {
    cteSql = lexicalCte
    fusedSql = `
    select l.id as id,
           1.0 / (${RRF_K} + l.rank) as score,
           'keyword'::text as matched_by
    from lexical l`
  }

  params.push(limit)

  const result = await pool.query<{
    chunk_id: number
    document_id: number
    title: string
    authors: string
    source: string
    published_year: number | null
    heading: string
    content: string
    page_from: number | null
    page_to: number | null
    score: string
    matched_by: 'both' | 'keyword' | 'meaning'
  }>(
    `with ${cteSql},
     fused as (${fusedSql})
     select c.id as chunk_id, c.document_id, d.title, d.authors, d.source, d.published_year,
            c.heading, c.content, c.page_from, c.page_to,
            f.score::text as score, f.matched_by
     from fused f
     join document_chunks c on c.id = f.id
     join documents d on d.id = c.document_id
     order by f.score desc, c.id
     limit $${params.length}`,
    params,
  )

  return result.rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    authors: r.authors,
    source: r.source,
    publishedYear: r.published_year,
    heading: r.heading,
    content: r.content,
    pageFrom: r.page_from,
    pageTo: r.page_to,
    score: Number(r.score),
    matchedBy: r.matched_by,
  }))
}
