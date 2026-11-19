'use client';

import { addDays, istDate, istDateTime, todayIst, type AllocationRun } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, CalendarCheck2, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { DecisionList, OrderPipeline, WeightsEditor } from '@/components/allocation';
import { AppShell } from '@/components/AppShell';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TRIGGER: Record<string, string> = {
  SCHEDULED: 'Scheduled job',
  MANUAL: 'Run by ops',
  DECLINE: 'Rider declined',
  NO_SHOW: 'Rider no-show',
  OFFLINE: 'Rider offline',
};

function RunRow({ run, open, onToggle }: { run: AllocationRun; open: boolean; onToggle: () => void }) {
  const decisions = useQuery({
    queryKey: ['allocation-decisions', run.id],
    queryFn: () => api.admin.allocationRunDecisions(run.id),
    enabled: open,
  });
  return (
    <li className="rounded-2xl border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open}
              className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
        <span className="tabular w-40 text-sm font-medium">{istDateTime(run.startedAt)}</span>
        <Badge tone={run.trigger === 'MANUAL' ? 'info' : 'default'}>{TRIGGER[run.trigger] ?? run.trigger}</Badge>
        <span className="text-sm"><b className="tabular">{run.assigned}</b> of <span className="tabular">{run.considered}</span> assigned</span>
        {run.unassigned > 0 ? <Badge tone="danger">{run.unassigned} without a rider</Badge> : <Badge tone="success">All assigned</Badge>}
        <span className="text-xs text-muted-foreground">{run.riders} riders · {run.solveMs} ms · {run.travelSource === 'google-routes' ? 'road distances' : 'estimated distances'}</span>
        <span className="tabular ml-auto text-xs text-muted-foreground">cost {Number(run.totalCost ?? 0).toFixed(1)}</span>
      </button>
      {open ? (
        <div className="border-t p-4">
          {decisions.error ? <Alert>{errorText(decisions.error)}</Alert> : null}
          {decisions.isLoading ? <p className="text-sm text-muted-foreground">Loading decisions…</p> : null}
          {decisions.data ? <DecisionList decisions={decisions.data} showOrder /> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * How orders are created and given to riders, the decisions the engine made (who, when, why), and the weights that
 * steer it. Ops can create orders and run allocation for a day by hand.
 */
export default function AllocationPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(addDays(todayIst(), 1));
  const [open, setOpen] = useState<string | null>(null);
  const dashboard = useQuery({ queryKey: ['dashboard', date], queryFn: () => api.admin.dashboard(date) });
  const runs = useQuery({ queryKey: ['allocation-runs', date], queryFn: () => api.admin.allocationRuns(date) });
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['allocation-runs'] }),
    qc.invalidateQueries({ queryKey: ['dashboard', date] }),
    qc.invalidateQueries({ queryKey: ['admin-orders'] }),
  ]);
  const generate = useMutation({ mutationFn: () => api.admin.generateOrders(date), onSuccess: refresh });
  const allocate = useMutation({ mutationFn: () => api.admin.autoAssign(date), onSuccess: refresh });
  const write = can('SUPER_ADMIN', 'OPS_ADMIN');

  return (
    <AppShell>
      <PageHeader eyebrow="Operations" title="Rider allocation"
        description="How orders are created and handed to riders, every decision with its reasons, and the weights behind them."
        actions={write ? (
          <>
            <Button variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>
              <CalendarCheck2 className="h-4 w-4" /> Create orders
            </Button>
            <Button disabled={allocate.isPending} onClick={() => allocate.mutate()}>
              <Bike className="h-4 w-4" /> Allocate riders
            </Button>
          </>
        ) : null} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Day" htmlFor="alloc-date"><Input id="alloc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <p className="pb-2 text-sm text-muted-foreground">
          {istDate(date)} · {dashboard.data ? `${dashboard.data.total} orders, ${dashboard.data.unassigned} without a rider, ${dashboard.data.scheduledPartners} riders on shift` : '…'}
        </p>
      </div>

      {generate.error ?? allocate.error ? <Alert>{errorText(generate.error ?? allocate.error)}</Alert> : null}
      {generate.data ? (
        <Alert tone="success">Created {generate.data.created} orders from {generate.data.candidates} active plans ({generate.data.skipped} skipped: leave, holidays, closed schools or already created).</Alert>
      ) : null}
      {allocate.data ? (
        <Alert tone={allocate.data.unassigned > 0 ? 'info' : 'success'}>
          {allocate.data.considered === 0 ? 'Nothing to allocate: every order for this day already has a rider.'
            : `Assigned ${allocate.data.assigned} of ${allocate.data.considered} orders and planned ${allocate.data.routesPlanned} routes. ${allocate.data.unassigned > 0 ? `${allocate.data.unassigned} still have no rider; open the run below to see why.` : ''}`}
        </Alert>
      ) : null}

      <OrderPipeline counts={dashboard.data?.ordersByStatus as Record<string, number> | undefined} />

      <section className="mt-6">
        <h2 className="mb-3 font-display text-[22px] font-semibold">Runs for this day</h2>
        {runs.error ? <Alert>{errorText(runs.error)}</Alert> : null}
        {runs.data && runs.data.length === 0 ? (
          <EmptyState icon={Bike} title="No allocation runs for this day yet"
                      description="Runs start after the 21:00 cut-off, or when you press Allocate riders. Quiet re-runs that change nothing are not listed." />
        ) : null}
        <ul className="space-y-2">
          {runs.data?.map((r) => (
            <RunRow key={r.id} run={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </ul>
      </section>

      <Card className="mt-6">
        <CardHeader icon={SlidersHorizontal} title="How riders are chosen"
          description="The engine finds the cheapest way to serve every order at once. Each term is measured in km of riding, so you can compare them directly." />
        <WeightsEditor editable={can('SUPER_ADMIN')} />
      </Card>
    </AppShell>
  );
}
