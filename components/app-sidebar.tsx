'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Library,
  Menu,
  Plus,
  ScrollText,
  Settings2,
  Users,
} from 'lucide-react'
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
const GROUP_OPEN_STORAGE_KEY = 'sidebar-group-open'

const PRIMARY_LINKS = [
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/assistant', label: 'Assistant', icon: Bot },
  { href: '/knowledge', label: 'Reference library', icon: Library },
]
const MANAGE_LINK = { href: '/sidebars', label: 'Manage sidebars', icon: Settings2 }
const ADMIN_LINKS = [
  { href: '/admin/users', label: 'Team & access', icon: Users },
  { href: '/logs', label: 'Activity log', icon: ScrollText },
]

function NavLink({
  href,
  active,
  collapsed,
  icon,
  onClick,
  children,
}: {
  href: string
  active: boolean
  collapsed: boolean
  icon?: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
}) {
  const link = (
    <Link
      href={href}
      onClick={onClick}
      aria-label={typeof children === 'string' ? children : undefined}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors lg:py-3',
        collapsed && 'lg:justify-center lg:px-2',
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {icon}
      <span className={cn('truncate', collapsed && 'lg:hidden')}>{children}</span>
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
  // Desktop only: icon rail vs. full-width sidebar.
  const [collapsed, setCollapsed] = useState(false)
  // Mobile only: whether the navigation panel is expanded below the toggle bar.
  const [mobileOpen, setMobileOpen] = useState(false)
  // Both: whether the "Sidebars" group's links are shown.
  const [groupOpen, setGroupOpen] = useState(true)
  const canManage = role === 'editor' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'

  // Read the saved preferences after mount only, so the server-rendered
  // markup matches the first client render and React doesn't flag a
  // hydration mismatch.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true')
      setGroupOpen(localStorage.getItem(GROUP_OPEN_STORAGE_KEY) !== 'false')
    } catch {
      // localStorage unavailable (private mode, etc.) — keep the defaults.
    }
  }, [])

  function persist(key: string, value: boolean) {
    try {
      localStorage.setItem(key, String(value))
    } catch {
      // Best-effort persistence only.
    }
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      persist(COLLAPSE_STORAGE_KEY, !prev)
      return !prev
    })
  }

  function toggleGroup() {
    setGroupOpen((prev) => {
      persist(GROUP_OPEN_STORAGE_KEY, !prev)
      return !prev
    })
  }

  const closeMobile = () => setMobileOpen(false)
  const currentLabel =
    [...PRIMARY_LINKS, MANAGE_LINK, ...ADMIN_LINKS].find((l) => l.href === pathname)?.label ??
    sidebars.find((s) => pathname === `/s/${s.slug}`)?.name ??
    'Menu'

  return (
    <aside
      className={cn(
        'shrink-0 border-b border-border px-5 py-3 transition-[width] duration-200 lg:sticky lg:top-[73px] lg:flex lg:h-[calc(100vh-73px)] lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-4',
        collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
      )}
    >
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="app-navigation"
        onClick={() => setMobileOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 rounded-lg py-1.5 text-sm font-medium lg:hidden"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Menu className="size-4 shrink-0" />
          <span className="truncate">{currentLabel}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', mobileOpen && 'rotate-180')} />
      </button>

      <div
        id="app-navigation"
        className={cn(
          'flex-col justify-between pb-2 lg:flex lg:flex-1 lg:pb-0',
          mobileOpen ? 'mt-3 flex' : 'hidden',
        )}
      >
        <div>
          <div className={cn('mb-2 hidden items-center lg:flex', collapsed ? 'justify-center' : 'justify-end')}>
            <Button variant="ghost" size="icon-sm" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleCollapsed}>
              {collapsed ? <ChevronRight /> : <ChevronLeft />}
            </Button>
          </div>
          <nav className="mb-3 flex flex-col gap-1 border-b border-border pb-3 lg:mb-4 lg:pb-4">
            {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => (
              <NavLink
                key={href}
                href={href}
                active={pathname === href}
                collapsed={collapsed}
                onClick={closeMobile}
                icon={<Icon className="size-4 shrink-0" />}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            aria-expanded={groupOpen}
            aria-controls="sidebar-group"
            onClick={toggleGroup}
            className={cn(
              'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground',
              collapsed && 'lg:hidden',
            )}
          >
            <span>Sidebars · {sidebars.length}</span>
            <ChevronDown className={cn('size-3.5 transition-transform', !groupOpen && '-rotate-90')} />
          </button>
          <nav
            id="sidebar-group"
            className={cn(
              'flex flex-col gap-1',
              // The desktop icon rail has no group header to reopen it, so the
              // group only hides there when the full sidebar is showing.
              !groupOpen && (collapsed ? 'max-lg:hidden' : 'hidden'),
            )}
          >
            {sidebars.map((sidebar) => (
              <NavLink
                key={sidebar.id}
                href={`/s/${sidebar.slug}`}
                active={pathname === `/s/${sidebar.slug}`}
                collapsed={collapsed}
                onClick={closeMobile}
                icon={
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-current/20 text-[11px] font-semibold uppercase">
                    {sidebar.name.charAt(0)}
                  </span>
                }
              >
                {sidebar.name}
              </NavLink>
            ))}
            {sidebars.length === 0 && (
              <p className={cn('px-3 py-3 text-sm text-muted-foreground', collapsed && 'lg:hidden')}>No sidebars yet.</p>
            )}
          </nav>
        </div>

        <div>
          {canManage && (
            <>
              {collapsed ? (
                <>
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
                  <Button variant="outline" className="mt-4 w-full lg:hidden" onClick={() => setDialogOpen(true)}>
                    <Plus data-icon="inline-start" />
                    Add sidebar
                  </Button>
                </>
              ) : (
                <Button variant="outline" className="mt-4 w-full" onClick={() => setDialogOpen(true)}>
                  <Plus data-icon="inline-start" />
                  Add sidebar
                </Button>
              )}
              <div className="mt-2 flex flex-col">
                <NavLink
                  href={MANAGE_LINK.href}
                  active={pathname === MANAGE_LINK.href}
                  collapsed={collapsed}
                  onClick={closeMobile}
                  icon={<Settings2 className="size-4 shrink-0" />}
                >
                  {MANAGE_LINK.label}
                </NavLink>
              </div>
              <AddSidebarDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            </>
          )}
          {isSuperAdmin && (
            <nav className="mt-4 flex flex-col gap-1 border-t border-border pt-4">
              {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
                <NavLink
                  key={href}
                  href={href}
                  active={pathname === href}
                  collapsed={collapsed}
                  onClick={closeMobile}
                  icon={<Icon className="size-4 shrink-0" />}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </aside>
  )
}
