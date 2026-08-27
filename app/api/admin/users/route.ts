import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { createAppUser, deleteAppUser, listAppUsers, setAppUserRole, type AppRole } from '@/lib/queries/app-users'
import { recordAudit } from '@/lib/audit'

const VALID_ROLES: AppRole[] = ['pending', 'reader', 'editor', 'super_admin', 'revoked']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await listAppUsers())
}

export async function POST(request: Request) {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!EMAIL_RE.test(email) || !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: 'A valid email and role are required' }, { status: 400 })
  }

  try {
    const created = await createAppUser(email, body.role, body.displayName || null, ctx.email!)
    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'user.create',
      entityType: 'app_user',
      entityId: created.email,
      diff: { after: { email: created.email, role: created.role } },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json(
        { error: 'That email is already in the system — change their role from the table instead.' },
        { status: 409 },
      )
    }
    throw error
  }
}

export async function DELETE(request: Request) {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (typeof body?.email !== 'string' || !body.email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (body.email.toLowerCase() === ctx.email!.toLowerCase()) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 })
  }

  const deleted = await deleteAppUser(body.email)
  if (!deleted) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'user.delete',
    entityType: 'app_user',
    entityId: deleted.email,
    diff: { before: { email: deleted.email, role: deleted.role } },
  })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (typeof body?.email !== 'string' || !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: 'email and a valid role are required' }, { status: 400 })
  }
  if (body.email.toLowerCase() === ctx.email!.toLowerCase() && body.role !== 'super_admin') {
    return NextResponse.json({ error: "You can't change your own role away from Super Admin" }, { status: 400 })
  }

  const updated = await setAppUserRole(body.email, body.role, ctx.email!)
  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'user.role_change',
    entityType: 'app_user',
    entityId: updated.email,
    diff: { after: { email: updated.email, role: updated.role } },
  })
  return NextResponse.json(updated)
}
