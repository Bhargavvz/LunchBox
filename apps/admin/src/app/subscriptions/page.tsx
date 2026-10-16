'use client';

import { istDate, rupees } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, CardTitle, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function PlanForm() {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: '', name: '', description: '', price: '', billingPeriod: 'MONTHLY', maxDaysPerWeek: 5 });
  const create = useMutation({
    mutationFn: () => api.admin.createPlan({
      code: f.code.toUpperCase(), name: f.name, description: f.description || undefined,
      pricePaise: Math.round(Number(f.price) * 100), billingPeriod: f.billingPeriod as 'MONTHLY' | 'QUARTERLY',
      maxDaysPerWeek: Number(f.maxDaysPerWeek),
    }),
    onSuccess: () => { setF({ ...f, code: '', name: '', price: '' }); void qc.invalidateQueries({ queryKey: ['plans'] }); },
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
      <Button type="submit" disabled={create.isPending}>Create plan</Button>
    </form>
  );
}

export default function SubscriptionsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.admin.plans });
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
      <PageHeader title="Plans & subscriptions" />
      {plans.error ?? subs.error ?? cancel.error ? <Alert>{errorText(plans.error ?? subs.error ?? cancel.error)}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between"><CardTitle>{p.name}</CardTitle><StatusBadge status={p.active ? 'ACTIVE' : 'CANCELLED'} /></div>
            <p className="text-2xl font-bold">{rupees(p.pricePaise)}</p>
            <p className="text-sm text-muted-foreground">{p.billingPeriod} · up to {p.maxDaysPerWeek} days/week · {p.code}</p>
            {can('SUPER_ADMIN') ? <Button size="sm" variant="outline" className="mt-2" onClick={() => togglePlan.mutate(p)}>{p.active ? 'Deactivate' : 'Activate'}</Button> : null}
          </Card>
        ))}
      </div>
      {can('SUPER_ADMIN') ? <Card className="mt-6"><PlanForm /></Card> : null}
      <div className="mt-8 flex items-end justify-between">
        <CardTitle>Subscriptions</CardTitle>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['', 'PENDING_PAYMENT', 'ACTIVE', 'HALTED', 'CANCELLED', 'EXPIRED'].map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
        </Select>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left"><tr><th className="p-2">Child</th><th>Plan</th><th>Status</th><th>Days</th><th>Start</th><th>Paid until</th><th /></tr></thead>
          <tbody>
            {subs.data?.items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-2">{s.childName}</td><td>{s.planName}</td><td><StatusBadge status={s.status} /></td>
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
