'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Bot, ChevronLeft, ChevronRight, Library, Plus, ScrollText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AddSidebarDialog } from '@/components/add-sidebar-dialog'
import { cn } from '@/lib/utils'
import type { Sidebar } from '@/lib/queries/sidebars'
import type { AppRole } from '@/lib/queries/app-users'

// Persisted client-side only (per-browser preference, not app data) — plain
// localStorage is the right tool, no need to round-trip this through the
// server.
const COLLAPSE_STORAGE_KEY = 'sidebar-collapsed'

function NavLink({
  href,
  active,
  collapsed,
  icon,
  children,
}: {
  href: string
  active: boolean
  collapsed: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const link = (
    <Link
      href={href}
      aria-label={typeof children === 'string' ? children : undefined}
      className={cn(
        'flex min-w-max items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors',
        collapsed && 'lg:min-w-0 lg:justify-center lg:px-2',
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {icon}
      <span className={collapsed ? 'lg:hidden' : undefined}>{children}</span>
    </Link>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{children}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({ sidebars, role }: { sidebars: Sidebar[]; role: AppRole }) {
  const pathname = usePathname()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const canManage = role === 'editor' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'

  // Read the saved preference after mount only, so the server-rendered
  // (always expanded) markup matches the first client render and React
  // doesn't flag a hydration mismatch.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true')
    } catch {
      // localStorage unavailable (private mode, etc.) — stay expanded.
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next))
      } catch {
        // Best-effort persistence only.
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'shrink-0 border-b border-border p-4 transition-[width] duration-200 lg:sticky lg:top-[73px] lg:flex lg:h-[calc(100vh-73px)] lg:flex-col lg:justify-between lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-4',
        collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
      )}
    >
      <div>
        <div className={cn('mb-2 hidden items-center lg:flex', collapsed ? 'justify-center' : 'justify-end')}>
          <Button variant="ghost" size="icon-sm" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleCollapsed}>
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>
        <nav className="flex gap-2 overflow-auto lg:mb-4 lg:flex-col lg:overflow-visible lg:border-b lg:border-border lg:pb-4">
          <NavLink href="/reports" active={pathname === '/reports'} collapsed={collapsed} icon={<BarChart3 className="size-4 shrink-0" />}>
            Reports
          </NavLink>
          <NavLink href="/assistant" active={pathname === '/assistant'} collapsed={collapsed} icon={<Bot className="size-4 shrink-0" />}>
            Assistant
          </NavLink>
          <NavLink href="/knowledge" active={pathname === '/knowledge'} collapsed={collapsed} icon={<Library className="size-4 shrink-0" />}>
            Reference library
          </NavLink>
        </nav>
        <nav className="flex gap-2 overflow-auto lg:flex-col lg:overflow-visible">
          {sidebars.map((sidebar) => (
            <NavLink
              key={sidebar.id}
              href={`/s/${sidebar.slug}`}
              active={pathname === `/s/${sidebar.slug}`}
              collapsed={collapsed}
              icon={
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-current/20 text-[11px] font-semibold uppercase">
                  {sidebar.name.charAt(0)}
                </span>
              }
            >
              {sidebar.name}
            </NavLink>
          ))}
          {sidebars.length === 0 && !collapsed && (
            <p className="px-3 py-3 text-sm text-muted-foreground">No sidebars yet.</p>
          )}
        </nav>
      </div>

      <div>
        {canManage && (
          <>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Add sidebar"
                      className="mt-4 hidden w-full lg:flex"
                      onClick={() => setDialogOpen(true)}
                    >
                      <Plus />
                    </Button>
                  }
                />
                <TooltipContent side="right">Add sidebar</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="outline" className="mt-4 w-full" onClick={() => setDialogOpen(true)}>
                <Plus data-icon="inline-start" />
                Add sidebar
              </Button>
            )}
            <AddSidebarDialog open={dialogOpen} onOpenChange={setDialogOpen} />
          </>
        )}
        {isSuperAdmin && (
          <nav className="mt-4 flex gap-2 border-t border-border pt-4 lg:flex-col">
            <NavLink href="/admin/users" active={pathname === '/admin/users'} collapsed={collapsed} icon={<Users className="size-4 shrink-0" />}>
              Team &amp; access
            </NavLink>
            <NavLink href="/logs" active={pathname === '/logs'} collapsed={collapsed} icon={<ScrollText className="size-4 shrink-0" />}>
              Activity log
            </NavLink>
          </nav>
        )}
      </div>
    </aside>
  )
}
