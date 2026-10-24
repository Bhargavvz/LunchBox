'use client';

import { istTime, todayIst, type AdminAlert, type DashboardResponse, type LivePartnerMessage } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BellRing,
  Bike,
  CircleAlert,
  CircleCheck,
  Clock3,
  PackageCheck,
  Radio,
  Siren,
  TriangleAlert,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MapFrame, PartnerMarkers } from '@/components/maps';
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errorText, realtime } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const WAITING = ['SCHEDULED', 'ASSIGNED', 'REASSIGNED'];
const MOVING = ['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL'];
const PROBLEM = ['PICKUP_FAILED', 'DELIVERY_FAILED'];

function sum(d: DashboardResponse, statuses: string[]): number {
  return statuses.reduce((n, s) => n + (d.ordersByStatus[s] ?? 0), 0);
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** A KPI tile: label, a sans value, and one line of context. Colour only appears when the number needs action. */
function Kpi({ label, value, context, icon: Glyph, tone = 'neutral', href }: {
  label: string;
  value: string | number;
  context?: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'attention';
  href?: string;
}) {
  const body = (
    <Card className={cn('relative h-full p-4 transition-shadow', href && 'hover:shadow-warm-lg',
      tone === 'attention' && 'border-destructive/30 bg-destructive-soft/40')}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <Glyph className={cn('h-4 w-4', tone === 'attention' ? 'text-destructive' : 'text-muted-foreground/70')} aria-hidden />
      </div>
      <p className={cn('tabular mt-2 text-[28px] font-semibold leading-none tracking-tight', tone === 'attention' && 'text-destructive')}>{value}</p>
      {context ? <p className="mt-2 text-xs text-muted-foreground">{context}</p> : null}
      {href ? <ArrowUpRight className="absolute bottom-3.5 right-3.5 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden /> : null}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

const SEGMENTS = [
  { key: 'waiting', label: 'Waiting for pickup', color: 'var(--chart-waiting)', icon: Clock3 },
  { key: 'moving', label: 'On the road', color: 'var(--chart-moving)', icon: Bike },
  { key: 'done', label: 'Delivered', color: 'var(--chart-done)', icon: CircleCheck },
  { key: 'problem', label: 'Failed', color: 'var(--chart-problem)', icon: CircleAlert },
] as const;

/** Where every lunchbox is right now, as one stacked bar in pipeline order (waiting → moving → done → problem). */
function Pipeline({ d }: { d: DashboardResponse }) {
  const counts = { waiting: sum(d, WAITING), moving: sum(d, MOVING), done: d.ordersByStatus['DELIVERED'] ?? 0, problem: sum(d, PROBLEM) };
  const total = counts.waiting + counts.moving + counts.done + counts.problem;
  const cancelled = d.ordersByStatus['CANCELLED'] ?? 0;
  const [hover, setHover] = useState<(typeof SEGMENTS)[number]['key'] | null>(null);

  return (
    <div>
      <div className="relative">
        <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full bg-muted" role="img"
             aria-label={SEGMENTS.map((s) => `${s.label}: ${counts[s.key]}`).join(', ')}>
          {total > 0 ? SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
            <div
              key={s.key}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              className={cn('h-full transition-opacity first:rounded-l-full last:rounded-r-full', hover && hover !== s.key && 'opacity-40')}
              style={{ flexGrow: counts[s.key], flexBasis: 0, backgroundColor: s.color, minWidth: 6 }}
            />
          )) : null}
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {SEGMENTS.map((s) => (
          <li key={s.key}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              className={cn('rounded-lg transition-opacity', hover && hover !== s.key && 'opacity-50')}>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} aria-hidden />
              <s.icon className="h-3.5 w-3.5" aria-hidden />
              {s.label}
            </div>
            <p className="tabular mt-1 pl-[18px] text-lg font-semibold">
              {counts[s.key]}
              {total > 0 && hover === s.key ? (
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">of {total}</span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      {cancelled > 0 ? <p className="mt-3 text-xs text-muted-foreground">{cancelled} cancelled today (leave days, holidays or admin) are not in the bar.</p> : null}
    </div>
  );
}

function alertStyle(type: string): { icon: LucideIcon; tone: 'danger' | 'warning' | 'info' } {
  if (type.includes('SOS')) return { icon: Siren, tone: 'danger' };
  if (type.includes('FAILED')) return { icon: TriangleAlert, tone: 'danger' };
  if (type.includes('NO_SHOW') || type.includes('UNASSIGNED')) return { icon: UserRoundX, tone: 'warning' };
  return { icon: BellRing, tone: 'info' };
}

const alertTone = {
  danger: 'bg-destructive-soft text-destructive',
  warning: 'bg-accent-soft text-accent-soft-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
};

export default function DashboardPage() {
  const date = todayIst();
  const { state } = useAuth();
  const dash = useQuery({ queryKey: ['dashboard', date], queryFn: () => api.admin.dashboard(date), refetchInterval: 30_000 });
  const initial = useQuery({ queryKey: ['live-partners'], queryFn: api.admin.livePartners });
  const [live, setLive] = useState<Record<string, LivePartnerMessage & { label: string }>>({});
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);

  useEffect(() => {
    if (!initial.data) return;
    setLive(Object.fromEntries(initial.data.map((p) => [p.partnerId, {
      partnerId: p.partnerId, lat: p.lat, lng: p.lng, headingDeg: p.headingDeg, speedMps: p.speedMps,
      activeOrders: p.activeOrders, at: p.recordedAt, label: p.name ?? p.partnerId,
    }])));
  }, [initial.data]);

  useEffect(() => {
    realtime.connect();
    const offLive = realtime.subscribeAdminLive((m) =>
      setLive((cur) => ({ ...cur, [m.partnerId]: { ...m, label: cur[m.partnerId]?.label ?? m.partnerId } })));
    const offAlerts = realtime.subscribeAdminAlerts((a) => setAlerts((cur) => [a, ...cur].slice(0, 50)));
    return () => {
      offLive();
      offAlerts();
    };
  }, []);

  const d = dash.data;
  const inTransit = d ? sum(d, MOVING) : 0;
  const failed = d ? sum(d, PROBLEM) : 0;
  const partners = useMemo(() => Object.values(live), [live]);
  const firstName = state.kind === 'ready' ? (state.me.displayName ?? '').trim().split(/\s+/)[0] : '';

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${longDate(date)} · IST`}
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description="Every lunchbox on today's run, live."
        actions={
          <Link href="/orders/" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm font-medium shadow-warm transition-colors hover:bg-muted">
            Open orders <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />
      {dash.error ? <div className="mb-5"><Alert title="Couldn't load today's numbers">{errorText(dash.error)}</Alert></div> : null}

      <section aria-label="Today at a glance" className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card className="paper-grain relative overflow-hidden p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-[13px] font-medium text-muted-foreground">Pickups today</p>
              {d ? (
                <p className="tabular mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em]">{d.total.toLocaleString('en-IN')}</p>
              ) : <Skeleton className="mt-3 h-12 w-28" />}
              <p className="mt-3 text-sm text-muted-foreground">
                {d ? <><span className="font-semibold text-foreground">{d.delivered}</span> delivered · <span className="font-semibold text-foreground">{inTransit}</span> on the road</> : ' '}
              </p>
            </div>
            <div className="min-w-[180px] rounded-xl border bg-background/60 p-4">
              <p className="text-[13px] font-medium text-muted-foreground">On-time</p>
              <p className="tabular mt-1 text-[28px] font-semibold leading-none">{d ? `${d.onTimeRate}%` : '—'}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${d ? Math.min(100, d.onTimeRate) : 0}%`, backgroundColor: 'var(--chart-done)' }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{d ? `${d.onTime} of ${d.delivered} before the bell` : ' '}</p>
            </div>
          </div>
          <div className="mt-7">{d ? <Pipeline d={d} /> : <Skeleton className="h-3.5 w-full rounded-full" />}</div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Kpi label="Unassigned" icon={UserRoundX} value={d?.unassigned ?? '—'} href="/orders/"
               tone={d && d.unassigned > 0 ? 'attention' : 'neutral'}
               context={d ? (d.unassigned > 0 ? 'Need a partner before pickup' : 'Every order has a partner') : undefined} />
          <Kpi label="Failed" icon={TriangleAlert} value={failed} href="/issues/"
               tone={failed > 0 ? 'attention' : 'neutral'}
               context={failed > 0 ? 'Reasons logged, parents notified' : 'Nothing has gone wrong'} />
          <Kpi label="Delivered" icon={PackageCheck} value={d?.delivered ?? '—'}
               context={d && d.total > 0 ? `${d.total - d.delivered} still to go` : undefined} />
          <Kpi label="Partners on shift" icon={Bike} value={d ? `${d.activePartners}/${d.scheduledPartners}` : '—'} href="/partners/"
               context={d ? (d.activePartners < d.scheduledPartners ? `${d.scheduledPartners - d.activePartners} not started yet` : 'Full roster out') : undefined} />
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={Radio}
            title="Live partners"
            description={partners.length === 1 ? '1 partner sharing location' : `${partners.length} partners sharing location`}
            actions={
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <span className="relative h-2 w-2 rounded-full bg-primary">
                  <span className="absolute inset-0 rounded-full bg-primary animate-pulse-ring" aria-hidden />
                </span>
                Live
              </span>
            }
          />
          <MapFrame label="Live map of delivery partners" height={400}>
            <PartnerMarkers partners={partners.map((p) => ({ partnerId: p.partnerId, lat: p.lat, lng: p.lng,
              label: `${p.label} · ${p.activeOrders} active · ${istTime(p.at)}` }))} />
          </MapFrame>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={BellRing}
            title="Alerts"
            description="SOS, failures and no-shows as they happen"
            actions={d && d.openIssues > 0 ? (
              <Link href="/issues/"><Badge tone="danger" dot>{d.openIssues === 1 ? '1 open issue' : `${d.openIssues} open issues`}</Badge></Link>
            ) : null}
          />
          <ul className="-mx-2 flex-1 space-y-1 overflow-y-auto" aria-live="polite" style={{ maxHeight: 400 }}>
            {alerts.length === 0 ? (
              <li><EmptyState icon={CircleCheck} title="All quiet" description="New alerts appear here the moment they're raised." /></li>
            ) : null}
            {alerts.map((a, i) => {
              const s = alertStyle(a.type);
              return (
                <li key={`${a.at}-${i}`} className="flex gap-3 rounded-lg px-2 py-2.5 animate-pop-in hover:bg-muted/50">
                  <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', alertTone[s.tone])}>
                    <s.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold">{a.type.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p>
                      <time className="tabular shrink-0 text-[11px] text-muted-foreground">{istTime(a.at)}</time>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{a.message}</p>
                    {s.tone === 'danger' ? (
                      <Link href="/issues/" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        Open issues <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </AppShell>
  );
}
