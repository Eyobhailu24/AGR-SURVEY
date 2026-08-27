'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus, ScrollText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddSidebarDialog } from '@/components/add-sidebar-dialog'
import type { Sidebar } from '@/lib/queries/sidebars'
import type { AppRole } from '@/lib/queries/app-users'

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex min-w-max items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
      }`}
    >
      {children}
    </Link>
  )
}

export function AppSidebar({ sidebars, role }: { sidebars: Sidebar[]; role: AppRole }) {
  const pathname = usePathname()
  const [dialogOpen, setDialogOpen] = useState(false)
  const canManage = role === 'editor' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'

  return (
    <aside className="border-b border-border p-4 lg:flex lg:min-h-[calc(100vh-73px)] lg:flex-col lg:justify-between lg:border-b-0 lg:border-r lg:p-6">
      <nav className="flex gap-2 overflow-auto lg:flex-col">
        {sidebars.map((sidebar) => (
          <NavLink key={sidebar.id} href={`/s/${sidebar.slug}`} active={pathname === `/s/${sidebar.slug}`}>
            {sidebar.name}
          </NavLink>
        ))}
        {sidebars.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No sidebars yet.</p>}
      </nav>
      {canManage && (
        <>
          <Button variant="outline" className="mt-4 w-full lg:mt-4" onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            Add sidebar
          </Button>
          <AddSidebarDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
      )}
      {isSuperAdmin && (
        <nav className="mt-4 flex gap-2 border-t border-border pt-4 lg:mt-6 lg:flex-col">
          <NavLink href="/admin/users" active={pathname === '/admin/users'}>
            <Users className="size-4" />
            Team &amp; access
          </NavLink>
          <NavLink href="/logs" active={pathname === '/logs'}>
            <ScrollText className="size-4" />
            Activity log
          </NavLink>
        </nav>
      )}
    </aside>
  )
}
