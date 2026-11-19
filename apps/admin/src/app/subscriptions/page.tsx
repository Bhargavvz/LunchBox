'use client';

import { istDate, rupees, type PlanResponse } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, CardTitle, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** One feature per line; blank lines dropped; at most 8 (the server enforces the same). */
const toFeatures = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);

function FeaturesEditor({ plan, onDone }: { plan: PlanResponse; onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState(plan.features.join('\n'));
  const save = useMutation({
    mutationFn: () => api.admin.updatePlan(plan.id, { name: plan.name, description: plan.description ?? undefined,
      maxDaysPerWeek: plan.maxDaysPerWeek, active: plan.active, features: toFeatures(text) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans'] }); onDone(); },
  });
  return (
    <div className="mt-3 space-y-2">
      {save.error ? <Alert>{errorText(save.error)}</Alert> : null}
      <textarea aria-label={`Features of ${plan.name}`} rows={4} value={text} onChange={(e) => setText(e.target.value)}
                className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Save features</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function PlanForm() {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: '', name: '', description: '', price: '', billingPeriod: 'MONTHLY', maxDaysPerWeek: 5, features: '' });
  const create = useMutation({
    mutationFn: () => api.admin.createPlan({
      code: f.code.toUpperCase(), name: f.name, description: f.description || undefined,
      pricePaise: Math.round(Number(f.price) * 100), billingPeriod: f.billingPeriod as 'MONTHLY' | 'QUARTERLY',
      maxDaysPerWeek: Number(f.maxDaysPerWeek), features: toFeatures(f.features),
    }),
    onSuccess: () => { setF({ ...f, code: '', name: '', price: '', features: '' }); void qc.invalidateQueries({ queryKey: ['plans'] }); },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
      <CardTitle>New plan</CardTitle>
      <p className="text-xs text-muted-foreground">Prices are fixed once created at Razorpay; to change a price create a new plan and deactivate the old one.</p>
      {create.error ? <Alert>{errorText(create.error)}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Code" htmlFor="pl-code"><Input id="pl-code" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="MONTHLY_5" /></Field>
        <Field label="Name" htmlFor="pl-name"><Input id="pl-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Price (₹)" htmlFor="pl-price"><Input id="pl-price" type="number" min={1} step="0.01" required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Billing" htmlFor="pl-period">
          <Select id="pl-period" value={f.billingPeriod} onChange={(e) => setF({ ...f, billingPeriod: e.target.value })}>
            <option>MONTHLY</option><option>QUARTERLY</option>
          </Select>
        </Field>
        <Field label="Max days/week" htmlFor="pl-days"><Input id="pl-days" type="number" min={1} max={6} value={f.maxDaysPerWeek} onChange={(e) => setF({ ...f, maxDaysPerWeek: Number(e.target.value) })} /></Field>
        <Field label="Description" htmlFor="pl-desc"><Input id="pl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <Field label="Features shown to parents (one per line, up to 8)" htmlFor="pl-features">
        <textarea id="pl-features" rows={4} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })}
                  placeholder={'Pickup on school days\nLive tracking\nPhoto at handover'}
                  className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Field>
      <Button type="submit" disabled={create.isPending}>Create plan</Button>
    </form>
  );
}

export default function SubscriptionsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.admin.plans });
  const [editing, setEditing] = useState<string | null>(null);
  const subs = useQuery({ queryKey: ['subscriptions', status], queryFn: () => api.admin.subscriptions(status || undefined) });
  const togglePlan = useMutation({
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
      <PageHeader eyebrow="Money" title="Plans & subscriptions" />
      {plans.error ?? subs.error ?? cancel.error ? <Alert>{errorText(plans.error ?? subs.error ?? cancel.error)}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between"><CardTitle>{p.name}</CardTitle><StatusBadge status={p.active ? 'ACTIVE' : 'CANCELLED'} /></div>
            <p className="tabular mt-2 font-display text-[44px] font-bold leading-none text-primary">{rupees(p.pricePaise)}</p>
            <p className="text-sm text-muted-foreground">
              {p.billingPeriod === 'QUARTERLY' ? 'Every 3 months' : 'Every month'} · up to {p.maxDaysPerWeek} days a week
            </p>
            <p className="mt-1"><code className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] text-muted-foreground">{p.code}</code></p>
            {p.features.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{p.features.map((x) => <li key={x}>{x}</li>)}</ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">No features listed yet.</p>}
            {editing === p.id ? <FeaturesEditor plan={p} onDone={() => setEditing(null)} /> : null}
            {can('SUPER_ADMIN') && editing !== p.id ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => togglePlan.mutate(p)}>{p.active ? 'Deactivate' : 'Activate'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)}>Edit features</Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {can('SUPER_ADMIN') ? <Card className="mt-6"><PlanForm /></Card> : null}
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
