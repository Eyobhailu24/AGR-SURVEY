import { redirect } from 'next/navigation'
import { signOut } from '@/auth'
import { getSessionWithRole } from '@/lib/auth-guard'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function PendingApprovalPage() {
  const { email, role } = await getSessionWithRole()
  if (!email) redirect('/login')
  if (role !== 'pending' && role !== 'revoked') redirect('/dashboard')

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="font-serif text-2xl font-semibold">
          {role === 'revoked' ? 'Access revoked' : 'Waiting for approval'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{email}</span>.{' '}
          {role === 'revoked'
            ? 'Your access was revoked by an administrator.'
            : 'A Super Admin needs to approve your account and assign a role before you can continue.'}
        </p>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  )
}
