import { NextResponse } from 'next/server'
import { generateObject, NoObjectGeneratedError } from 'ai'
import { requireRole } from '@/lib/auth-guard'
import { MAX_OUTPUT_TOKENS, VISION_MODEL, isAiConfigured, xkiro } from '@/lib/ai/provider'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { buildImageExtractionRequest } from '@/lib/import/image-extraction'

// Produces candidate rows in the exact same shape lib/import/build-schema.ts
// expects (sample_type/measurement_type as plain labels, values keyed by the
// sidebar's own column keys) — so the client hands the result straight to
// /import/csv's existing preview+commit flow instead of a second validator.
// Never writes to the database itself; extraction only, always reviewed.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const imageBase64 = body?.imageBase64
  const mediaType = body?.mediaType || 'image/jpeg'
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return NextResponse.json({ error: 'A notebook image is required' }, { status: 400 })
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, WebP, or GIF image' }, { status: 400 })
  }

  if (!isAiConfigured()) {
    console.error('[import/image] XKIRO_API_KEY is not set')
    return NextResponse.json({ error: 'Image extraction is not configured. Contact an administrator.' }, { status: 503 })
  }

  try {
    const { object } = await generateObject({
      model: xkiro(VISION_MODEL),
      ...buildImageExtractionRequest(sidebar, imageBase64, mediaType),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    return NextResponse.json({ rows: object.rows })
  } catch (error) {
    console.error('[import/image]', error)
    if (NoObjectGeneratedError.isInstance(error)) {
      return NextResponse.json({
        error: error.finishReason === 'length'
          ? 'The extracted data was too long. Crop the photo to fewer rows and try again.'
          : 'The AI could not return valid data for this photo. Try again with a clearer image or fewer rows.',
      }, { status: 502 })
    }
    const message = error instanceof Error ? error.message : 'Image extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
