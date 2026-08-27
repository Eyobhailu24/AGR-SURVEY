import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user?.email) redirect('/')

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Field notebook</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold">Sign in to continue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access is limited to approved team members. New accounts wait for admin approval after signing in.
          </p>
        </div>
        <form
          className="w-full"
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/' })
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>
      </div>
    </main>
  )
}
