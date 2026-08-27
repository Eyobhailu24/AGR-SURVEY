import { redirect } from 'next/navigation'
import { signOut } from '@/auth'
import { getSessionWithRole } from '@/lib/auth-guard'
import { listSidebars } from '@/lib/queries/sidebars'
import { AppSidebar } from '@/components/app-sidebar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, name, role } = await getSessionWithRole()
  if (!email) redirect('/login')
  if (role === 'pending' || role === 'revoked') redirect('/pending-approval')

  const sidebars = await listSidebars()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Field notebook / 2026
            </p>
            <h1 className="font-serif text-xl font-semibold">Research dashboard</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {name ?? email} · <span className="capitalize">{role.replace('_', ' ')}</span>
            </span>
            <ThemeToggle />
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] lg:flex lg:items-start">
        <AppSidebar sidebars={sidebars} role={role} />
        <main className="flex flex-1 flex-col gap-5 p-5 lg:min-w-0 lg:p-10">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
