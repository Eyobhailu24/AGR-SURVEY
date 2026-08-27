import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { listAppUsers, setAppUserRole, type AppRole } from '@/lib/queries/app-users'
import { recordAudit } from '@/lib/audit'

const VALID_ROLES: AppRole[] = ['pending', 'reader', 'editor', 'super_admin', 'revoked']

export async function GET() {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await listAppUsers())
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
