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
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton, buttonVariants } from '@/components/ui/primitives';
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

/** A KPI tile: label, a Khand figure, and one line of context. Colour only appears when the number needs action. */
function Kpi({ label, value, context, icon: Glyph, tone = 'neutral', href }: {
  label: string;
  value: string | number;
  context?: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'attention';
  href?: string;
}) {
  const body = (
    <Card className={cn('relative h-full p-4 transition-colors', href && 'hover:border-primary/40',
      tone === 'attention' && 'border-destructive/35 bg-destructive-soft/50')}>
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-medium text-muted-foreground">{label}</p>
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg',
          tone === 'attention' ? 'bg-destructive-soft text-destructive' : 'bg-secondary text-secondary-foreground')}>
          <Glyph className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className={cn('tabular mt-1.5 font-display text-[42px] font-bold leading-none', tone === 'attention' && 'text-destructive')}>{value}</p>
      {context ? <p className="mt-1.5 text-[13px] text-muted-foreground">{context}</p> : null}
      {href ? <ArrowUpRight className="absolute bottom-3.5 right-3.5 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden /> : null}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

const SEGMENTS = [
  { key: 'waiting', label: 'Waiting for pickup', color: 'var(--board-waiting)', icon: Clock3 },
  { key: 'moving', label: 'On the road', color: 'var(--board-moving)', icon: Bike },
  { key: 'done', label: 'Delivered', color: 'var(--board-done)', icon: CircleCheck },
  { key: 'problem', label: 'Failed', color: 'var(--board-problem)', icon: CircleAlert },
] as const;

/**
 * Where every lunchbox is right now, drawn as a tiffin laid on its side: one tier per stage in pipeline order
 * (waiting, on the road, delivered, failed), each as wide as its share of the day and joined to the next by a clamp.
 * Each tier also carries its icon and count, so colour is never the only cue.
 */
function TiffinPipeline({ d }: { d: DashboardResponse }) {
  const counts = { waiting: sum(d, WAITING), moving: sum(d, MOVING), done: d.ordersByStatus['DELIVERED'] ?? 0, problem: sum(d, PROBLEM) };
  const total = counts.waiting + counts.moving + counts.done + counts.problem;
  const cancelled = d.ordersByStatus['CANCELLED'] ?? 0;
  const [hover, setHover] = useState<(typeof SEGMENTS)[number]['key'] | null>(null);
  const shown = total > 0 ? SEGMENTS.filter((x) => counts[x.key] > 0) : [];

  return (
    <div>
      <div className="flex h-14 w-full items-center" role="img"
           aria-label={SEGMENTS.map((x) => `${x.label}: ${counts[x.key]}`).join(', ')}>
        {total === 0 ? (
          <div className="flex h-full flex-1 items-center justify-center rounded-[14px] border border-dashed border-board-line text-[14px] text-board-muted">
            No lunchboxes on today&apos;s run yet
          </div>
        ) : shown.map((x, i) => (
          <div key={x.key} className="flex h-full items-center" style={{ flexGrow: counts[x.key], flexBasis: 0, minWidth: 64 }}>
            {i > 0 ? <span aria-hidden className="h-2.5 w-2 shrink-0 bg-board-line" /> : null}
            <div
              onMouseEnter={() => setHover(x.key)}
              onMouseLeave={() => setHover(null)}
              className={cn('rim flex h-full flex-1 items-center gap-2 rounded-[14px] px-3 text-[hsl(36_91%_9%)] transition-opacity',
                hover && hover !== x.key && 'opacity-45')}
              style={{ backgroundColor: x.color }}
            >
              <x.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="tabular font-display text-[24px] font-bold leading-none">{counts[x.key]}</span>
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-7 gap-y-2">
        {SEGMENTS.map((x) => (
          <li key={x.key}
              onMouseEnter={() => setHover(x.key)}
              onMouseLeave={() => setHover(null)}
              className={cn('flex items-center gap-2 text-[13.5px] text-board-muted transition-opacity', hover && hover !== x.key && 'opacity-50')}>
            <span className="h-3 w-4 rounded-[4px]" style={{ backgroundColor: x.color }} aria-hidden />
            <span>{x.label}</span>
            <span className="tabular font-semibold text-board-foreground">{counts[x.key]}</span>
          </li>
        ))}
      </ul>
      {cancelled > 0 ? <p className="mt-3 text-[13px] text-board-muted">{cancelled} cancelled today (leave days, holidays or admin) are not counted here.</p> : null}
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
          <Link href="/orders/" className={buttonVariants({ variant: 'outline' })}>
            Open orders <ArrowUpRight aria-hidden />
          </Link>
        }
      />
      {dash.error ? <div className="mb-5"><Alert title="Couldn't load today's numbers">{errorText(dash.error)}</Alert></div> : null}

      <section aria-label="Today at a glance" className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* The one bold surface in the console: today's run, chalked up on the staff-room board. */}
        <div className="chalk-dust relative overflow-hidden rounded-3xl bg-board p-6 text-board-foreground md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[14px] font-medium text-board-muted">Pickups today</p>
              {d ? (
                <p className="tabular mt-1 font-display text-[96px] font-bold leading-[0.85]">{d.total.toLocaleString('en-IN')}</p>
              ) : <Skeleton className="mt-3 h-20 w-32 bg-board-raised" />}
              <p className="mt-3 text-[15px] text-board-muted">
                {d ? <><span className="font-semibold text-board-foreground">{d.delivered}</span> delivered · <span className="font-semibold text-board-foreground">{inTransit}</span> on the road</> : ' '}
              </p>
            </div>
            <div className="min-w-[200px] rounded-2xl border border-board-line bg-board-raised/60 p-4">
              <p className="text-[14px] font-medium text-board-muted">On time</p>
              {/* Before anything is delivered there is no rate yet; 0 % would read as a failure. */}
              <p className="tabular mt-1 font-display text-[52px] font-bold leading-none">{d && d.delivered > 0 ? `${d.onTimeRate}%` : '—'}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-board-line" aria-hidden>
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${d ? Math.min(100, d.onTimeRate) : 0}%`, backgroundColor: 'var(--board-done)' }} />
              </div>
              <p className="mt-2 text-[13px] text-board-muted">
                {d ? (d.delivered > 0 ? `${d.onTime} of ${d.delivered} before the lunch bell` : 'Nothing delivered yet') : ' '}
              </p>
            </div>
          </div>
          <div className="mt-8">{d ? <TiffinPipeline d={d} /> : <Skeleton className="h-14 w-full rounded-[14px] bg-board-raised" />}</div>
        </div>

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
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
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
