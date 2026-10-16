'use client';

import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileClock,
  LayoutDashboard,
  LifeBuoy,
  Map,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth, type Role } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from './ui/primitives';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const STAFF: Role[] = ['SUPER_ADMIN', 'OPS_ADMIN', 'SUPPORT'];
const WRITE: Role[] = ['SUPER_ADMIN', 'OPS_ADMIN'];

const NAV: NavItem[] = [
  { href: '/dashboard/', label: 'Dashboard', icon: LayoutDashboard, roles: STAFF },
  { href: '/orders/', label: 'Orders', icon: ClipboardList, roles: STAFF },
  { href: '/partners/', label: 'Partners', icon: Truck, roles: STAFF },
  { href: '/issues/', label: 'Issues & SOS', icon: LifeBuoy, roles: STAFF },
  { href: '/parents/', label: 'Parents & children', icon: Users, roles: STAFF },
  { href: '/schools/', label: 'Schools', icon: Building2, roles: STAFF },
  { href: '/service-areas/', label: 'Service areas', icon: Map, roles: STAFF },
  { href: '/subscriptions/', label: 'Plans & subscriptions', icon: CreditCard, roles: STAFF },
  { href: '/payouts/', label: 'Payouts', icon: Wallet, roles: STAFF },
  { href: '/notifications/', label: 'Broadcasts', icon: Bell, roles: WRITE },
  { href: '/reports/', label: 'Reports', icon: BarChart3, roles: STAFF },
  { href: '/audit/', label: 'Audit log', icon: FileClock, roles: STAFF },
  { href: '/settings/', label: 'Settings', icon: Settings, roles: STAFF },
  { href: '/staff/', label: 'Staff', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
  { href: '/school/', label: "Today's deliveries", icon: ClipboardList, roles: ['SCHOOL_ADMIN'] },
];

export function AppShell({ children, roles = STAFF }: { children: ReactNode; roles?: Role[] }) {
  const { state, signOut, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.kind === 'signedOut' || state.kind === 'mfaChallenge' || state.kind === 'mfaEnroll') router.replace('/login/');
  }, [state, router]);

  if (state.kind !== 'ready') return <p className="p-8 text-muted-foreground">Loading…</p>;
  if (!can(...roles)) {
    return (
      <main className="p-8">
        <p>You do not have access to this page.</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">Skip to content</a>
      <nav aria-label="Main" className="hidden w-60 shrink-0 border-r bg-card p-3 md:block">
        <div className="mb-4 px-2 text-lg font-bold text-primary">LunchBox</div>
        <ul className="space-y-1">
          {NAV.filter((n) => n.roles.includes(state.me.role)).map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined}
                      className={cn('flex items-center gap-2 rounded-md px-2 py-2 text-sm', active ? 'bg-secondary font-semibold text-secondary-foreground' : 'hover:bg-muted')}>
                  <n.icon className="h-4 w-4" aria-hidden />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b bg-card px-6 py-3 text-sm">
          <span className="text-muted-foreground">{state.me.email} · {state.me.role}</span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>Sign out</Button>
        </header>
        <main id="main" className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
