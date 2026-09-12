import type { FeatureExtractionPipeline } from '@huggingface/transformers'

// Embeddings run locally rather than through an API: xKiro exposes no
// embeddings endpoint (POST /v1/embeddings returns 404, and every model in
// its catalog is modality "chat"), and adding a second AI vendor just for
// this would be a lot of moving parts for a small corpus.
//
// BAAI bge-small-en-v1.5 — 384 dimensions, ~130MB, tens of milliseconds per
// text on CPU. The dimension is pinned in db/migrations/0006_knowledge_base.sql;
// changing the model means changing that column and re-embedding everything.
export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5'
export const EMBEDDING_DIMENSIONS = 384

// BGE is asymmetric: passages are embedded bare, queries get this prefix.
// Omitting it measurably degrades retrieval and is the usual reason this
// model family appears to "not work".
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '

// Loaded once per process and reused. The first call pays model load (a few
// seconds, longer on a cold serverless instance); later calls are fast.
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null

function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      // Imported lazily so that merely importing this module — which the
      // chat route does on every request — never pays the cost unless an
      // embedding is actually needed.
      const { pipeline } = await import('@huggingface/transformers')
      return pipeline('feature-extraction', EMBEDDING_MODEL)
    })()
    // Don't cache a rejected promise: a transient failure (a half-downloaded
    // model, say) would otherwise poison the process permanently.
    pipelinePromise.catch(() => {
      pipelinePromise = null
    })
  }
  return pipelinePromise
}

async function run(texts: string[]): Promise<number[][]> {
  const extractor = await getPipeline()
  // normalize: true gives unit-length vectors, so cosine distance in
  // Postgres is a plain dot product and needs no scaling.
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  return output.tolist() as number[][]
}

/** Embed document chunks for storage. Batched by the caller. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  return run(texts)
}

/** Embed a search query. Applies the BGE query prefix. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await run([QUERY_PREFIX + text])
  return vector
}

/**
 * Query-side embedding that is allowed to fail.
 *
 * The semantic arm is an enhancement, not a dependency: if the model is
 * still loading on a cold start, or onnxruntime can't initialise, hybrid
 * search degrades to lexical-only rather than returning an error. Callers
 * pass the null straight through to the search, which then weights the
 * vector arm at zero.
 */
export async function embedQuerySafe(text: string, timeoutMs = 4000): Promise<number[] | null> {
  try {
    return await Promise.race([
      embedQuery(text),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
  } catch (error) {
    console.error('[embed] query embedding failed; falling back to lexical-only search', error)
    return null
  }
}

/** pgvector's text input format: '[0.1,0.2,...]'. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`
}
