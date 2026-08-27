import { redirect } from 'next/navigation'
import { listSidebars } from '@/lib/queries/sidebars'

// Auth/role gating already happened in app/(app)/layout.tsx by the time this
// renders — this just picks a landing page among the (possibly user-created)
// sidebars.
export default async function HomePage() {
  const sidebars = await listSidebars()
  if (sidebars.length > 0) redirect(`/s/${sidebars[0].slug}`)
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
      No sidebars yet — add one from the panel on the left to get started.
    </div>
  )
}
