import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { recordAudit } from '@/lib/audit'
import { deleteDocument } from '@/lib/queries/knowledge'

// Removing a document retracts a source the assistant may have been citing,
// so it carries the same super_admin bar as adding one. Chunks (and their
// embeddings) cascade via the foreign key.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok || !ctx.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const documentId = Number(id)
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return NextResponse.json({ error: 'Invalid document id.' }, { status: 400 })
  }

  await deleteDocument(documentId)
  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'knowledge.document.delete',
    entityType: 'document',
    entityId: documentId,
  })

  return NextResponse.json({ ok: true })
}
