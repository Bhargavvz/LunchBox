'use client';

import { istDate, rupees, type PlanResponse } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Ticket } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Coupons, FeatureTypes, PlanEditor } from '@/components/plans';
import { Alert, Badge, Button, Card, CardHeader, CardTitle, EmptyState, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SubscriptionsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.admin.plans });
  const [editing, setEditing] = useState<PlanResponse | 'new' | null>(null);
  const subs = useQuery({ queryKey: ['subscriptions', status], queryFn: () => api.admin.subscriptions(status || undefined) });
  const togglePlan = useMutation({
    // Only name, days and active are sent: the server keeps every other setting as it is.
    mutationFn: (p: { id: string; name: string; description: string | null; maxDaysPerWeek: number; active: boolean }) =>
      api.admin.updatePlan(p.id, { name: p.name, description: p.description ?? undefined, maxDaysPerWeek: p.maxDaysPerWeek, active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.admin.cancelSubscription(id, 'Cancelled by operations'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });

  return (
    <AppShell>
      <PageHeader eyebrow="Money" title="Plans & subscriptions" description="Plans, their features and limits, coupons, and every family's subscription."
        actions={can('SUPER_ADMIN') ? <Button onClick={() => setEditing('new')}>New plan</Button> : null} />
      {plans.error ?? subs.error ?? cancel.error ? <Alert>{errorText(plans.error ?? subs.error ?? cancel.error)}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between"><CardTitle>{p.name}</CardTitle><StatusBadge status={p.active ? 'ACTIVE' : 'CANCELLED'} /></div>
            <p className="tabular mt-2 font-display text-[44px] font-bold leading-none text-primary">{rupees(p.pricePaise)}</p>
            <p className="text-sm text-muted-foreground">
              {p.billingPeriod === 'QUARTERLY' ? 'Every 3 months' : 'Every month'} · up to {p.maxDaysPerWeek} days a week
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.visibility === 'HIDDEN' ? <Badge>Hidden</Badge> : null}
              {p.trialDays > 0 ? <Badge tone="success">{p.trialDays}-day trial</Badge> : null}
              {p.durationPeriods ? <Badge tone="info">Runs {p.durationPeriods} period{p.durationPeriods === 1 ? '' : 's'}</Badge> : null}
              <Badge tone="default">{p.liveSubscribers}{p.maxSubscribers ? ` / ${p.maxSubscribers}` : ''} subscribers</Badge>
            </div>
            <p className="mt-1"><code className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] text-muted-foreground">{p.code}</code></p>
            {p.features.length > 0 || p.featureList.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {p.features.map((x) => <li key={x}>{x}</li>)}
                {p.featureList.map((x) => (
                  <li key={x.key}>{x.label}: <b>{typeof x.value === 'boolean' ? (x.value ? 'yes' : 'no') : Array.isArray(x.value)
                    ? (x.value as string[]).map((d) => d.slice(0, 3).charAt(0) + d.slice(1, 3).toLowerCase()).join(', ')
                    : x.valueType === 'MONEY' ? rupees(Number(x.value)) : String(x.value)}</b></li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">No features listed yet.</p>}
            {can('SUPER_ADMIN') ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit plan</Button>
                <Button size="sm" variant="ghost" onClick={() => togglePlan.mutate(p)}>{p.active ? 'Stop selling' : 'Sell again'}</Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {editing ? <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      <Card className="mt-6">
        <CardHeader icon={Ticket} title="Coupons" description="Discount codes parents enter at checkout. Each family can use a code once." />
        <Coupons editable={can('SUPER_ADMIN')} plans={plans.data ?? []} />
      </Card>
      <Card className="mt-6">
        <CardHeader icon={ListChecks} title="Plan features" description="The kinds of features a plan can have. Add new ones here without a release; built-in ones are enforced by LunchBox." />
        <FeatureTypes editable={can('SUPER_ADMIN')} />
      </Card>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <CardTitle className="text-[24px]">Subscriptions</CardTitle>
        <Select aria-label="Filter by status" className="w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['', 'PENDING_PAYMENT', 'ACTIVE', 'HALTED', 'CANCELLED', 'EXPIRED'].map((s) => (
            <option key={s} value={s}>{s ? s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ') : 'All statuses'}</option>
          ))}
        </Select>
      </div>
      <div className="mt-3 lb-table-wrap">
        <table className="lb-table">
          <thead><tr><th>Child</th><th>Plan</th><th>Status</th><th>Days</th><th>Start</th><th>Paid until</th><th /></tr></thead>
          <tbody>
            {subs.data && subs.data.items.length === 0 ? (
              <tr><td colSpan={7}><EmptyState title="No subscriptions" description={status ? 'None with this status. Try another filter.' : 'Subscriptions appear here once parents choose a plan.'} /></td></tr>
            ) : null}
            {subs.data?.items.map((s) => (
              <tr key={s.id}>
                <td>{s.childName}</td><td>{s.planName}</td><td><StatusBadge status={s.status} /></td>
                <td>{s.daysOfWeek.map((d) => d.slice(0, 3)).join(', ')}</td><td>{istDate(s.startDate)}</td>
                <td>{istDate(s.currentPeriodEnd)}</td>
                <td>{can('SUPER_ADMIN', 'OPS_ADMIN') && ['ACTIVE', 'HALTED', 'PENDING_PAYMENT'].includes(s.status)
                  ? <Button size="sm" variant="ghost" onClick={() => cancel.mutate(s.id)}>Cancel</Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
