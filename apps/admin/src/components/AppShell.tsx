'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { todayIst } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileClock,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Map,
  Menu,
  Monitor,
  Moon,
  School,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth, type Role } from '@/lib/auth';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { BrandMark } from './Brand';
import { CommandPalette, type Command } from './CommandPalette';
import { Avatar, Kbd, Skeleton } from './ui/primitives';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  group: string;
  keywords?: string;
}

const STAFF: Role[] = ['SUPER_ADMIN', 'OPS_ADMIN', 'SUPPORT'];
const WRITE: Role[] = ['SUPER_ADMIN', 'OPS_ADMIN'];

const NAV: NavItem[] = [
  { href: '/dashboard/', label: 'Dashboard', icon: LayoutDashboard, roles: STAFF, group: 'Operations', keywords: 'today live map home' },
  { href: '/orders/', label: 'Orders', icon: ClipboardList, roles: STAFF, group: 'Operations', keywords: 'deliveries pickups assign cancel' },
  { href: '/partners/', label: 'Partners', icon: Truck, roles: STAFF, group: 'Operations', keywords: 'riders drivers kyc' },
  { href: '/issues/', label: 'Issues & SOS', icon: LifeBuoy, roles: STAFF, group: 'Operations', keywords: 'problems emergency support' },
  { href: '/parents/', label: 'Parents & children', icon: Users, roles: STAFF, group: 'People', keywords: 'families students kids' },
  { href: '/schools/', label: 'Schools', icon: Building2, roles: STAFF, group: 'People', keywords: 'holidays timings' },
  { href: '/service-areas/', label: 'Service areas', icon: Map, roles: STAFF, group: 'People', keywords: 'zones polygons coverage' },
  { href: '/subscriptions/', label: 'Plans & subscriptions', icon: CreditCard, roles: STAFF, group: 'Money', keywords: 'pricing billing razorpay' },
  { href: '/payouts/', label: 'Payouts', icon: Wallet, roles: STAFF, group: 'Money', keywords: 'earnings razorpayx transfers' },
  { href: '/reports/', label: 'Reports', icon: BarChart3, roles: STAFF, group: 'Insights', keywords: 'analytics charts export csv' },
  { href: '/notifications/', label: 'Broadcasts', icon: Bell, roles: WRITE, group: 'Insights', keywords: 'push sms announce' },
  { href: '/audit/', label: 'Audit log', icon: FileClock, roles: STAFF, group: 'Admin', keywords: 'history changes who' },
  { href: '/settings/', label: 'Settings', icon: Settings, roles: STAFF, group: 'Admin', keywords: 'configuration app settings' },
  { href: '/staff/', label: 'Staff', icon: ShieldCheck, roles: ['SUPER_ADMIN'], group: 'Admin', keywords: 'team admins roles' },
  { href: '/school/', label: "Today's deliveries", icon: School, roles: ['SCHOOL_ADMIN'], group: 'My school', keywords: 'receipt incoming' },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  OPS_ADMIN: 'Operations',
  SUPPORT: 'Support',
  SCHOOL_ADMIN: 'School admin',
};

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Wall-clock time in Kolkata, the timezone every pickup window is defined in, regardless of the viewer's machine. */
function IstClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(now);
  const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(now);
  return (
    <span className="hidden items-center gap-2 text-[13px] text-muted-foreground sm:inline-flex" title="India Standard Time">
      <span>{day}</span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span className="tabular font-semibold text-foreground">{time}</span>
      <span className="text-[11px] font-semibold tracking-wide">IST</span>
    </span>
  );
}

function SidebarNav({ items, pathname, openIssues, onNavigate }: {
  items: NavItem[];
  pathname: string;
  openIssues: number;
  onNavigate?: () => void;
}) {
  const groups = useMemo(() => {
    const out: { name: string; items: NavItem[] }[] = [];
    for (const item of items) {
      const g = out.find((x) => x.name === item.group);
      if (g) g.items.push(item);
      else out.push({ name: item.group, items: [item] });
    }
    return out;
  }, [items]);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
      {groups.map((g) => (
        <div key={g.name}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-sidebar-muted/80">{g.name}</p>
          <ul className="space-y-0.5">
            {g.items.map((n) => {
              const active = pathname.startsWith(n.href);
              const badge = n.href === '/issues/' && openIssues > 0 ? openIssues : null;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      active
                        ? 'bg-sidebar-active font-semibold text-sidebar-foreground'
                        : 'text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-foreground',
                    )}
                  >
                    {active ? <span aria-hidden className="absolute -left-3 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r-full bg-accent" /> : null}
                    <n.icon className={cn('h-[17px] w-[17px] shrink-0', active ? 'text-accent' : 'opacity-80 group-hover:opacity-100')} aria-hidden />
                    <span className="flex-1 truncate">{n.label}</span>
                    {badge ? (
                      <span className="tabular rounded-full px-1.5 text-[11px] font-bold leading-[18px] text-white"
                            style={{ backgroundColor: 'var(--chart-problem)' }}
                            aria-label={`${badge} open`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Sidebar({ children, onSearch }: { children: ReactNode; onSearch: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <BrandMark className="h-8 w-8" />
        <div className="leading-none">
          <p className="font-display text-[19px] font-semibold tracking-tight">LunchBox</p>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-sidebar-muted">Operations console</p>
        </div>
      </div>
      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={onSearch}
          className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-[13px] text-sidebar-muted transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="flex-1">Search or jump to…</span>
          <Kbd className="border-white/15 bg-white/10 text-sidebar-muted shadow-none">⌘K</Kbd>
        </button>
      </div>
      {children}
      <div className="paper-grain border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-sidebar-muted">
        From home to school —<br />fresh meals, brighter futures.
      </div>
    </div>
  );
}

function UserMenu({ name, email, role, onSignOut }: { name: string; email: string; role: Role; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useThemePreference();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={name} size={32} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[180px] truncate text-[13px] font-semibold">{name}</span>
          <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[role]}</span>
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-warm-lg animate-pop-in">
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
            <Avatar name={name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          <div className="border-t px-2.5 pb-2 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Appearance</p>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn('flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all',
                    theme === t.value ? 'bg-card text-foreground shadow-warm' : 'text-muted-foreground hover:text-foreground')}
                >
                  <t.icon className="h-3.5 w-3.5" aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t pt-1.5">
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive-soft"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function displayName(email: string, given?: string | null): string {
  if (given && given.trim()) return given.trim();
  const local = email.split('@')[0] ?? email;
  return local.split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || email;
}

export function AppShell({ children, roles = STAFF }: { children: ReactNode; roles?: Role[] }) {
  const { state, signOut, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [, setTheme] = useThemePreference();

  const role = state.kind === 'ready' ? state.me.role : null;
  const isStaff = role !== null && STAFF.includes(role);
  const date = todayIst();
  const dash = useQuery({
    queryKey: ['dashboard', date],
    queryFn: () => api.admin.dashboard(date),
    refetchInterval: 30_000,
    enabled: isStaff,
  });
  const openIssues = dash.data?.openIssues ?? 0;

  useEffect(() => {
    if (state.kind === 'signedOut' || state.kind === 'mfaChallenge' || state.kind === 'mfaEnroll') router.replace('/login/');
  }, [state, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => (role ? NAV.filter((n) => n.roles.includes(role)) : []), [role]);

  const commands = useMemo<Command[]>(() => [
    ...items.map((n) => ({
      id: n.href,
      label: n.label,
      group: 'Go to',
      icon: n.icon,
      keywords: `${n.group} ${n.keywords ?? ''}`,
      run: () => router.push(n.href),
    })),
    ...THEMES.map((t) => ({
      id: `theme-${t.value}`,
      label: `Use ${t.label.toLowerCase()} theme`,
      group: 'Preferences',
      icon: t.icon,
      keywords: 'appearance dark mode colour',
      run: () => setTheme(t.value),
    })),
    { id: 'sign-out', label: 'Sign out', group: 'Account', icon: LogOut, keywords: 'logout exit', run: () => void signOut() },
  ], [items, router, setTheme, signOut]);

  if (state.kind !== 'ready') {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 shrink-0 bg-sidebar md:block" aria-hidden />
        <div className="flex-1 p-8" role="status" aria-label="Loading">
          <Skeleton className="mb-3 h-4 w-28" />
          <Skeleton className="mb-8 h-8 w-64" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </div>
    );
  }

  const me = state.me;
  const name = displayName(me.email ?? '', me.displayName);
  const current = items.find((n) => pathname.startsWith(n.href));

  if (!can(...roles)) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-semibold">You do not have access to this page.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your role is {ROLE_LABEL[me.role].toLowerCase()}. Ask a super admin if you need it.</p>
          {items[0] ? <Link href={items[0].href} className="mt-5 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline">Back to {items[0].label}</Link> : null}
        </div>
      </main>
    );
  }

  const nav = <SidebarNav items={items} pathname={pathname} openIssues={openIssues} onNavigate={() => setDrawerOpen(false)} />;

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-warm-lg">
        Skip to content
      </a>

      <nav aria-label="Main" className="sticky top-0 hidden h-screen w-64 shrink-0 md:block">
        <Sidebar onSearch={() => setPaletteOpen(true)}>{nav}</Sidebar>
      </nav>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[hsl(36_10%_10%/0.45)] animate-fade-in md:hidden" />
          <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 w-[min(18rem,86vw)] shadow-warm-lg animate-fade-in md:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <nav aria-label="Main" className="h-full">
              <Sidebar onSearch={() => { setDrawerOpen(false); setPaletteOpen(true); }}>{nav}</Sidebar>
            </nav>
            <DialogPrimitive.Close className="absolute right-3 top-6 rounded-md p-1.5 text-sidebar-muted hover:text-sidebar-foreground" aria-label="Close navigation">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md md:px-8">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"
                  className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            {current ? (
              <>
                <span className="hidden text-muted-foreground sm:inline">{current.group}</span>
                <span className="hidden text-muted-foreground/60 sm:inline" aria-hidden>/</span>
                <span className="truncate font-semibold">{current.label}</span>
              </>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2 md:gap-4">
            <IstClock />
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette"
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
              <Search className="h-5 w-5" />
            </button>
            {isStaff ? (
              <Link href="/issues/" aria-label={openIssues > 0 ? `${openIssues} open issues` : 'Issues'}
                    className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Bell className="h-5 w-5" aria-hidden />
                {openIssues > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background" style={{ backgroundColor: 'var(--chart-problem)' }} aria-hidden>
                    <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ backgroundColor: 'var(--chart-problem)' }} />
                  </span>
                ) : null}
              </Link>
            ) : null}
            <span className="hidden h-6 w-px bg-border md:block" aria-hidden />
            <UserMenu name={name} email={me.email ?? ''} role={me.role} onSignOut={() => void signOut()} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-7 animate-fade-in md:px-8">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}
