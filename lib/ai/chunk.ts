export type PageText = { page: number; text: string }

export type Chunk = {
  content: string
  pageFrom: number
  pageTo: number
  heading: string
  tokenCount: number
}

// Sized for retrieval, not for storage: chunks big enough to carry an
// argument, small enough that six of them fit comfortably in a prompt.
// ~4 chars per token is the usual English approximation — good enough for
// budgeting, and it avoids shipping a tokenizer just to count.
const TARGET_CHARS = 2000
const OVERLAP_CHARS = 300
const MIN_CHARS = 120

const estimateTokens = (text: string) => Math.ceil(text.length / 4)

/**
 * A short standalone line with no sentence-ending punctuation is almost
 * always a section heading in an extracted PDF. Worth detecting because
 * headings are weighted above body text in the tsvector, and because they
 * give a retrieved chunk a human-readable anchor.
 */
function looksLikeHeading(line: string) {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.length > 80) return false
  if (/[.!?;:,]$/.test(trimmed)) return false
  const words = trimmed.split(/\s+/)
  if (words.length > 12) return false
  return /^[A-Z0-9]/.test(trimmed)
}

type Block = { text: string; page: number; heading: string }

/** Split pages into paragraph blocks, carrying the page number and the heading in force. */
function toBlocks(pages: PageText[]): Block[] {
  const blocks: Block[] = []
  let heading = ''

  for (const { page, text } of pages) {
    // Blank line = paragraph break. PDF extraction also emits single
    // newlines mid-sentence, which must NOT be treated as breaks.
    for (const rawParagraph of text.split(/\n\s*\n+/)) {
      const lines = rawParagraph.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length === 0) continue

      if (lines.length === 1 && looksLikeHeading(lines[0])) {
        heading = lines[0]
        continue
      }
      if (looksLikeHeading(lines[0])) {
        heading = lines[0]
        lines.shift()
      }

      const paragraph = lines.join(' ').replace(/\s+/g, ' ').trim()
      if (paragraph) blocks.push({ text: paragraph, page, heading })
    }
  }
  return blocks
}

/** Take roughly the last `chars` characters of a chunk, starting at a sentence boundary where possible. */
function tailOverlap(text: string, chars: number) {
  if (text.length <= chars) return text
  const tail = text.slice(-chars)
  const boundary = tail.search(/(?<=[.!?])\s+/)
  return boundary === -1 ? tail : tail.slice(boundary).trim()
}

/**
 * Greedily packs paragraphs into chunks, never splitting mid-paragraph, and
 * carries a sentence-aligned overlap into the next chunk so an idea spanning
 * a boundary is still retrievable from both sides.
 *
 * A paragraph longer than the target on its own becomes its own chunk rather
 * than being cut — losing the sentence structure hurts retrieval more than an
 * oversized chunk does.
 */
export function chunkPages(pages: PageText[]): Chunk[] {
  const blocks = toBlocks(pages)
  const chunks: Chunk[] = []

  let buffer = ''
  let pageFrom = blocks[0]?.page ?? 1
  let pageTo = pageFrom
  let heading = blocks[0]?.heading ?? ''

  const flush = () => {
    const content = buffer.trim()
    if (content.length >= MIN_CHARS) {
      chunks.push({ content, pageFrom, pageTo, heading, tokenCount: estimateTokens(content) })
    }
    buffer = ''
  }

  for (const block of blocks) {
    if (buffer && buffer.length + block.text.length + 1 > TARGET_CHARS) {
      const carried = tailOverlap(buffer, OVERLAP_CHARS)
      flush()
      buffer = carried ? `${carried} ` : ''
      pageFrom = block.page
      heading = block.heading
    }
    if (!buffer) {
      pageFrom = block.page
      heading = block.heading || heading
    }
    buffer += (buffer ? ' ' : '') + block.text
    pageTo = block.page
  }
  flush()

  return chunks
}
