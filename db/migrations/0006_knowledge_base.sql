-- Research-document knowledge base for the AI assistant: approved papers and
-- references, chunked and indexed for hybrid retrieval.
--
-- Hybrid = two independent retrieval arms fused at query time:
--   * lexical  — tsvector/GIN, strong on exact agronomy terms ("nitrate",
--                "ryegrass") and on the vocabulary a researcher actually types
--   * semantic — pgvector/HNSW over locally-computed embeddings, which catch
--                the cases lexical search scores at zero ("leaves turning
--                yellow" vs. a paper that says "interveinal chlorosis")
--
-- Embeddings are 384-dimensional (BAAI bge-small-en-v1.5, run locally via
-- @huggingface/transformers — see lib/ai/embed.ts). They are computed at
-- ingest time only: the app's AI provider (xKiro) exposes no embeddings
-- endpoint, so there is deliberately no per-query embedding API dependency.
-- Changing the embedding model means changing this dimension and re-embedding
-- every chunk.

create extension if not exists vector;

create table documents (
  id             bigserial primary key,
  title          text not null,
  source         text not null default '',
  authors        text not null default '',
  published_year int,
  page_count     int,
  -- sha256 of the uploaded bytes: re-uploading the same file is a conflict
  -- rather than a silent duplicate in every future retrieval.
  checksum       text not null unique,
  status         text not null default 'pending'
                 check (status in ('pending', 'processing', 'ready', 'failed')),
  error          text,
  uploaded_by    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table document_chunks (
  id          bigserial primary key,
  document_id bigint not null references documents (id) on delete cascade,
  chunk_index int not null,
  page_from   int,
  page_to     int,
  heading     text not null default '',
  content     text not null,
  token_count int not null default 0,
  -- Nullable on purpose: a chunk is searchable by the lexical arm the moment
  -- it is stored, before embedding finishes or if embedding fails entirely.
  embedding   vector(384),
  -- Generated, not trigger-maintained, so it can never drift from content.
  -- Headings weigh above body text: a chunk under "Potassium uptake" should
  -- outrank one that merely mentions potassium in passing.
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) stored,
  created_at  timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index document_chunks_tsv_idx on document_chunks using gin (tsv);
create index document_chunks_document_idx on document_chunks (document_id);

-- HNSW over cosine distance. Embeddings are L2-normalised at write time, so
-- cosine distance and inner product rank identically; cosine is kept for
-- readability. m/ef_construction are pgvector's defaults, which are ample for
-- a corpus of this size.
create index document_chunks_embedding_idx on document_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
