'use client';

import { istDateTime, type AllocationDecision } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bike, CalendarCheck2, ClipboardList, Route, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Field, Input } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

const OUTCOME_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  ASSIGNED: 'success',
  MANUAL: 'info',
  UNASSIGNED: 'danger',
  DECLINED: 'warning',
  RELEASED: 'warning',
  CONFLICT: 'default',
};

const OUTCOME_LABEL: Record<string, string> = {
  ASSIGNED: 'Assigned by the engine',
  MANUAL: 'Assigned by ops',
  UNASSIGNED: 'No rider found',
  DECLINED: 'Declined by rider',
  RELEASED: 'Released',
  CONFLICT: 'Changed during the run',
};

interface Breakdown {
  distanceKm?: number;
  travelMinutes?: number;
  roadDistance?: boolean;
  distanceCost?: number;
  newSchoolCost?: number;
  workloadCost?: number;
  ratingCost?: number;
  reliabilityCost?: number;
  total?: number;
}

/** Who got an order, when, and why — newest first — with the cost terms that decided it. */
export function DecisionList({ decisions, showOrder = false }: { decisions: AllocationDecision[]; showOrder?: boolean }) {
  if (decisions.length === 0) {
    return <p className="text-sm text-muted-foreground">No allocation decisions yet. They appear after the first run.</p>;
  }
  return (
    <ol className="space-y-3">
      {decisions.map((d) => {
        const b = (d.breakdown ?? null) as Breakdown | null;
        return (
          <li key={d.id} className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={OUTCOME_TONE[d.outcome] ?? 'default'}>{OUTCOME_LABEL[d.outcome] ?? d.outcome}</Badge>
              {d.partnerName ? <span className="text-sm font-medium">{d.partnerName}</span> : null}
              {showOrder ? <code className="text-xs text-muted-foreground">{d.orderId.slice(-8)}</code> : null}
              <span className="tabular ml-auto text-xs text-muted-foreground">{istDateTime(d.createdAt)}</span>
            </div>
            <p className="mt-1.5 text-sm">{d.reason}</p>
            {b && b.total !== undefined ? (
              <dl className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {[
                  ['Distance', `${b.distanceKm?.toFixed(1)} km${b.roadDistance ? '' : ' (est.)'}`],
                  ['Ride', `${b.travelMinutes} min`],
                  ['New school', b.newSchoolCost?.toFixed(2)],
                  ['Workload', b.workloadCost?.toFixed(2)],
                  ['Rating', b.ratingCost?.toFixed(2)],
                  ['Reliability', b.reliabilityCost?.toFixed(2)],
                  ['Total cost', b.total?.toFixed(2)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted px-2 py-1">
                    <dt className="inline text-muted-foreground">{k} </dt>
                    <dd className="tabular inline font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {d.runnerUpName ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Next best: {d.runnerUpName} at {Number(d.runnerUpCost).toFixed(2)} · {d.eligibleRiders} eligible
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** How an order comes to exist and reach a rider — the steps ops can trigger by hand, with today's counts. */
export function OrderPipeline({ counts }: { counts?: Record<string, number> }) {
  const n = (k: string[]) => k.reduce((sum, s) => sum + (counts?.[s] ?? 0), 0);
  const steps = [
    { icon: Users, title: 'Active plans', text: 'Parents choose pickup days; leave days and school holidays are skipped.', count: null },
    { icon: CalendarCheck2, title: 'Create orders', text: 'At the cut-off (21:00) the next day freezes and one order per child is created.',
      count: n(['SCHEDULED', 'REASSIGNED']) },
    { icon: Bike, title: 'Allocate riders', text: 'Every 10 min after the cut-off the engine picks the cheapest fair assignment.',
      count: n(['ASSIGNED']) },
    { icon: Route, title: 'Plan routes', text: 'Each rider gets an ordered route through homes and school gates.',
      count: n(['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL']) },
    { icon: ClipboardList, title: 'Deliver', text: 'Pickup with the parent’s code, handover at the gate with a photo.',
      count: n(['DELIVERED']) },
  ];
  return (
    <ol className="grid gap-2 md:grid-cols-5" aria-label="How orders flow">
      {steps.map((s, i) => (
        <li key={s.title} className="relative rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><s.icon className="h-4 w-4" /></span>
            <span className="font-display text-[17px] font-semibold">{s.title}</span>
            {s.count !== null ? <span className="tabular ml-auto font-display text-xl font-bold">{s.count}</span> : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
          {i < steps.length - 1 ? (
            <ArrowRight aria-hidden className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground md:block" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const WEIGHT_FIELDS: { key: string; label: string; hint: string; step: number; min: number; max: number }[] = [
  { key: 'distancePerKm', label: 'Distance', hint: 'Cost of each km from the rider to the home (1 = plain km).', step: 0.1, min: 0.1, max: 10 },
  { key: 'newSchoolKm', label: 'New school', hint: 'Extra km a rider "pays" to add a school to their run. Higher keeps schools together.', step: 0.5, min: 0, max: 50 },
  { key: 'workloadKm', label: 'Fair shares', hint: 'How strongly work is spread. Higher evens out loads.', step: 0.5, min: 0, max: 50 },
  { key: 'ratingKm', label: 'Rating', hint: 'Km a 0-star rating costs; 5 stars costs nothing. New riders count as 4.', step: 0.5, min: 0, max: 50 },
  { key: 'reliabilityKm', label: 'Reliability', hint: 'Km a rider who misses every shift costs; no-shows and declines lower reliability.', step: 0.5, min: 0, max: 50 },
  { key: 'priorityMultiplier', label: 'Priority plans', hint: 'How much more it costs to leave a priority-delivery order without a rider.', step: 0.5, min: 1, max: 10 },
  { key: 'candidatesPerOrder', label: 'Riders compared per order', hint: 'Nearest eligible riders priced for each order.', step: 1, min: 1, max: 50 },
  { key: 'offlineAfterMinutes', label: 'Offline after (min)', hint: 'A started shift without a location this long counts as offline.', step: 1, min: 2, max: 60 },
  { key: 'roadDetourFactor', label: 'Road detour', hint: 'Straight line × this = road km, when no road map is connected.', step: 0.05, min: 1, max: 3 },
  { key: 'averageSpeedKmph', label: 'Average speed (km/h)', hint: 'City riding speed for travel times.', step: 1, min: 5, max: 60 },
  { key: 'unassignedPenaltyKm', label: 'Unassigned penalty', hint: 'Cost of leaving an order without a rider; keep it large.', step: 100, min: 100, max: 100000 },
];

/** Edits the allocation.weights setting with labelled fields and plain explanations. */
export function WeightsEditor({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.admin.settings });
  const setting = settings.data?.find((s) => s.key === 'allocation.weights');
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (setting && !draft) setDraft({ ...(setting.value as Record<string, number>) });
  }, [setting, draft]);
  const save = useMutation({
    mutationFn: () => api.admin.updateSetting('allocation.weights', draft, setting!.version),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  if (!setting || !draft) return <p className="text-sm text-muted-foreground">Loading weights…</p>;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      {save.error ? <Alert>{errorText(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">Saved. The next allocation run uses the new weights.</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {WEIGHT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`w-${f.key}`} hint={f.hint}>
            <Input id={`w-${f.key}`} type="number" step={f.step} min={f.min} max={f.max} disabled={!editable}
                   value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      {editable ? (
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>Save weights</Button>
          <Button type="button" variant="ghost" onClick={() => setDraft({ ...(setting.value as Record<string, number>) })}>Reset</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Only a super admin can change the weights.</p>}
    </form>
  );
}
