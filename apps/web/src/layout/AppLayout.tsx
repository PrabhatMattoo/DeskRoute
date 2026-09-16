import { Suspense } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useUser, useClerk } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import {
  Home,
  AlertCircle,
  Calendar,
  BookOpen,
  Settings as SettingsIcon,
  CircleCheck,
  LogOut,
  Code,
} from 'lucide-react'
import { keys, fetchers } from '@/lib/queries'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { RouteSkeleton } from './RouteSkeleton'
import { setupItems } from '@/features/home/setup-items'

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/escalations', label: 'Escalations', icon: AlertCircle },
  { to: '/appointments', label: 'Appointments', icon: Calendar },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
]

function isPathActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(item.to + '/')
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const { data: pendingEscalations } = useQuery({
    queryKey: keys.escalations('pending'),
    queryFn: () => fetchers.escalations('pending'),
  })
  const { user } = useUser()
  const { signOut } = useClerk()

  // What makes dismissing the checklist safe: this entry stands exactly while
  // something is outstanding.
  const { data: settings } = useQuery({
    queryKey: keys.settings,
    queryFn: fetchers.settings,
  })
  const setupLeft = settings ? setupItems(settings).filter((i) => !i.done).length : 0

  const pendingCount = pendingEscalations?.length ?? 0
  const firstName = user?.firstName || 'User'
  const avatarUrl = user?.imageUrl

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {/* One row. The label hides when collapsed and nothing moves, and h-8
              puts the trigger on the same centreline as the nav icons. */}
          <div className="flex h-8 items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
              DeskRoute
            </span>
            <SidebarTrigger className="ml-auto shrink-0 group-data-[collapsible=icon]:ml-0" />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const active = isPathActive(pathname, item)
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        render={<Link to={item.to} />}
                        isActive={active}
                        tooltip={item.label}
                        className="text-sm"
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.to === '/escalations' && pendingCount > 0 && (
                        <SidebarMenuBadge className="text-sm font-semibold">
                          {pendingCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            {setupLeft > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to="/" />}
                  tooltip="Finish setup"
                  className="text-sm text-accent-ink"
                >
                  <CircleCheck className="size-4" />
                  <span>Finish setup</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-sm font-semibold text-accent-ink">
                  {setupLeft}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to="/settings" />}
                isActive={pathname === '/settings'}
                tooltip="Settings"
                className="text-sm"
              >
                <SettingsIcon className="size-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* AGPL section 13: a network-interactive UI offers its users the
                source of the version they are talking to. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <a
                    href="https://github.com/PrabhatMattoo/DeskRoute"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Source code"
                  />
                }
                tooltip="Source code"
                className="text-sm"
              >
                <Code className="size-4" />
                <span>Source</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Who you are is a label. Signing out is the only action, so
                it is the only thing that reacts to a pointer. */}
            <SidebarMenuItem>
              <div
                className="flex h-8 items-center gap-2 rounded-lg p-2 text-sm text-sidebar-foreground"
                title={firstName}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="size-[18px] shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-[18px] shrink-0 rounded-full bg-sunk-1" />
                )}
                <span className="truncate group-data-[collapsible=icon]:hidden">
                  {firstName}
                </span>
              </div>
              <SidebarMenuAction
                onClick={() => signOut()}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="stage-float my-2.5 mr-3">
        <div className="flex flex-col flex-1 overflow-auto">
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
