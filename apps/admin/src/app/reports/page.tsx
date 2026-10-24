'use client';

import { addDays, todayIst } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, Star, TrendingUp, TriangleAlert, Trophy } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { AppShell } from '@/components/AppShell';
import { statusLabel } from '@/components/StatusBadge';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';

const PRESETS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** One tooltip for every chart: warm card, ink text, a colour chip per series (identity never rides on text colour). */
function ChartTooltip({ active, payload, label, unit, labelFormat }: TooltipProps<number, string> & { unit?: string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-warm-lg">
      <p className="mb-1.5 font-semibold">{labelFormat ? labelFormat(String(label)) : label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color }} aria-hidden />
            {p.name}
          </span>
          <span className="tabular font-semibold">{p.value}{unit ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

function Summary({ label, value, context, loading }: { label: string; value: string; context?: ReactNode; loading: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="tabular mt-1.5 text-[28px] font-semibold leading-none tracking-tight">{value}</p>}
      {context ? <p className="mt-2 text-xs text-muted-foreground">{context}</p> : null}
    </Card>
  );
}

type SortKey = 'partnerName' | 'assigned' | 'delivered' | 'onTimeRate' | 'failed' | 'rating';

export default function ReportsPage() {
  const today = todayIst();
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'onTimeRate', desc: true });
  const onTime = useQuery({ queryKey: ['r-ontime', from, to], queryFn: () => api.admin.onTimeReport(from, to) });
  const perf = useQuery({ queryKey: ['r-perf', from, to], queryFn: () => api.admin.partnerPerformance(from, to) });
  const failures = useQuery({ queryKey: ['r-fail', from, to], queryFn: () => api.admin.failures(from, to) });
  const err = onTime.error ?? perf.error ?? failures.error;

  const rows = useMemo(() => onTime.data ?? [], [onTime.data]);
  const totals = useMemo(() => {
    const delivered = rows.reduce((n, r) => n + r.delivered, 0);
    const onTimeCount = rows.reduce((n, r) => n + r.onTime, 0);
    const failed = rows.reduce((n, r) => n + r.failed, 0);
    return { delivered, onTimeCount, failed, rate: delivered > 0 ? Math.round((onTimeCount / delivered) * 1000) / 10 : null };
  }, [rows]);
  const latest = rows.length > 0 ? rows[rows.length - 1]! : null;

  const failureRows = useMemo(() => (failures.data ?? []).slice(0, 8).map((f) => ({
    ...f,
    label: f.reason?.trim() ? f.reason : statusLabel(f.status),
  })), [failures.data]);

  const partners = useMemo(() => {
    const list = (perf.data ?? []).map((r) => ({ ...r, failed: r.pickupFailed + r.deliveryFailed }));
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const av = a[sort.key] ?? -1;
      const bv = b[sort.key] ?? -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [perf.data, sort]);
  const bestRate = partners.reduce((m, p) => (p.delivered >= 5 ? Math.max(m, p.onTimeRate) : m), -1);

  const preset = PRESETS.find((p) => to === today && from === addDays(today, -p.days))?.days ?? null;
  const loading = onTime.isLoading;

  async function csv(path: string, name: string) {
    downloadBlob(await api.admin.downloadCsv(path, { from, to }), `${name}-${from}-${to}.csv`);
  }

  const Th = ({ k, children, align = 'right' }: { k: SortKey; children: ReactNode; align?: 'left' | 'right' }) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}
        className={cn('whitespace-nowrap border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground', align === 'right' ? 'text-right' : 'text-left')}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'partnerName' }))}
              className={cn('inline-flex items-center gap-1 hover:text-foreground', sort.key === k && 'text-foreground')}>
        {children}
        {sort.key === k ? (sort.desc ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden />) : null}
      </button>
    </th>
  );

  return (
    <AppShell>
      <PageHeader eyebrow="Insights" title="Reports" description="Served from the read replica; figures can lag live data by a few seconds."
        actions={<>
          <Button variant="outline" onClick={() => void csv('/api/v1/admin/reports/on-time.csv', 'on-time')}><Download className="h-4 w-4" aria-hidden />On-time CSV</Button>
          <Button variant="outline" onClick={() => void csv('/api/v1/admin/reports/partner-performance.csv', 'partners')}><Download className="h-4 w-4" aria-hidden />Partner CSV</Button>
        </>} />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Date range" className="flex rounded-lg border bg-card p-1 shadow-warm">
          {PRESETS.map((p) => (
            <button key={p.days} type="button" role="radio" aria-checked={preset === p.days}
                    onClick={() => { setFrom(addDays(today, -p.days)); setTo(today); }}
                    className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                      preset === p.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {p.label}
            </button>
          ))}
        </div>
        <Field label="From" htmlFor="r-from"><Input id="r-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="r-to"><Input id="r-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {err ? <div className="mb-5"><Alert title="Couldn't load the report">{errorText(err)}</Alert></div> : null}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Summary label="On-time rate" loading={loading} value={totals.rate === null ? '—' : `${totals.rate}%`}
                 context={`${totals.onTimeCount.toLocaleString('en-IN')} of ${totals.delivered.toLocaleString('en-IN')} before the bell`} />
        <Summary label="Delivered" loading={loading} value={totals.delivered.toLocaleString('en-IN')} context={`${shortDate(from)} – ${shortDate(to)}`} />
        <Summary label="Failed" loading={loading} value={totals.failed.toLocaleString('en-IN')}
                 context={totals.delivered + totals.failed > 0 ? `${Math.round((totals.failed / (totals.delivered + totals.failed)) * 1000) / 10}% of attempts` : undefined} />
        <Summary label="Partners active" loading={perf.isLoading} value={String(partners.filter((p) => p.assigned > 0).length)} context="With at least one assignment" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={TrendingUp} title="On-time delivery rate"
                      description={latest ? `Latest day: ${latest.onTimeRate}% on ${shortDate(latest.date)}` : 'Share of deliveries before the deadline'} />
          <div className="h-64" role="img" aria-label="Line chart of daily on-time delivery rate">
            {rows.length === 0 && !loading ? <EmptyState icon={TrendingUp} title="No deliveries in this range" /> : (
              <ResponsiveContainer>
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
                           content={<ChartTooltip unit="%" labelFormat={shortDate} />} />
                  <Line type="monotone" dataKey="onTimeRate" name="On-time" stroke="var(--chart-done)" strokeWidth={2} dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={TriangleAlert} title="Why deliveries failed" description="Top reasons in this range" />
          <div className="h-64" role="img" aria-label="Bar chart of failed deliveries by reason">
            {failureRows.length === 0 && !failures.isLoading ? (
              <EmptyState icon={Trophy} title="No failures in this range" description="Every attempted pickup and handover went through." />
            ) : (
              <ResponsiveContainer>
                <BarChart data={failureRows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ ...AXIS_TICK, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.6)' }} content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Orders" fill="var(--chart-problem)" maxBarSize={20} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" offset={8} style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--foreground))' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Daily volume" description="Delivered and failed per school day" />
          <div className="h-64" role="img" aria-label="Stacked bar chart of delivered and failed orders per day">
            {rows.length === 0 && !loading ? <EmptyState title="No deliveries in this range" /> : (
              <ResponsiveContainer>
                <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.6)' }} content={<ChartTooltip labelFormat={shortDate} />} />
                  <Legend verticalAlign="top" align="right" height={28} iconType="square" iconSize={9}
                          formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Bar dataKey="delivered" name="Delivered" stackId="v" fill="var(--chart-done)" maxBarSize={24}
                       stroke="hsl(var(--card))" strokeWidth={2} />
                  <Bar dataKey="failed" name="Failed" stackId="v" fill="var(--chart-problem)" maxBarSize={24} radius={[4, 4, 0, 0]}
                       stroke="hsl(var(--card))" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-warm">
        <div className="px-5 pt-5"><CardHeader title="Partner performance" description="Partners with five or more deliveries are eligible for the top on-time badge" /></div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Partner performance</caption>
            <thead className="text-left">
              <tr>
                <Th k="partnerName" align="left">Partner</Th>
                <Th k="assigned">Assigned</Th>
                <Th k="delivered">Delivered</Th>
                <Th k="onTimeRate">On-time</Th>
                <Th k="failed">Failed</Th>
                <Th k="rating">Rating</Th>
              </tr>
            </thead>
            <tbody>
              {perf.isLoading ? Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>{Array.from({ length: 6 }, (__, c) => <td key={c} className="border-b px-4 py-3.5"><Skeleton className="h-4 w-16" /></td>)}</tr>
              )) : null}
              {partners.map((r) => (
                <tr key={r.partnerId} className="transition-colors hover:bg-muted/45">
                  <td className="border-b border-border/70 px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.partnerName}
                      {r.onTimeRate === bestRate && r.delivered >= 5 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-soft-foreground">
                          <Trophy className="h-3 w-3" aria-hidden />Top on-time
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="tabular border-b border-border/70 px-4 py-3 text-right">{r.assigned}</td>
                  <td className="tabular border-b border-border/70 px-4 py-3 text-right">{r.delivered}</td>
                  <td className="border-b border-border/70 px-4 py-3">
                    <div className="flex items-center justify-end gap-2.5">
                      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.onTimeRate)}%`, backgroundColor: 'var(--chart-done)' }} />
                      </div>
                      <span className="tabular w-12 text-right font-semibold">{r.onTimeRate}%</span>
                    </div>
                  </td>
                  <td className={cn('tabular border-b border-border/70 px-4 py-3 text-right', r.failed > 0 && 'font-semibold text-destructive')}
                      title={`${r.pickupFailed} pickup · ${r.deliveryFailed} delivery`}>{r.failed}</td>
                  <td className="tabular border-b border-border/70 px-4 py-3 text-right">
                    {r.rating === null || r.rating === undefined ? <span className="text-muted-foreground">—</span> : (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />{r.rating.toFixed(1)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!perf.isLoading && partners.length === 0 ? <EmptyState title="No partner activity in this range" /> : null}
        </div>
      </div>
    </AppShell>
  );
}
