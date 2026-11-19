'use client';

import { istDate, rupees, type Coupon, type FeatureDefinition, type PlanResponse, type Schemas } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Dialog, DialogContent, Field, Input, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const toLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
const textareaClass = 'w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

type Values = Record<string, unknown>;

/** One input per feature type: yes/no, a number, days, text or rupees. Empty means "not part of this plan". */
function FeatureInput({ def, value, onChange }: { def: FeatureDefinition; value: unknown; onChange: (v: unknown) => void }) {
  const id = `feat-${def.key}`;
  switch (def.valueType) {
    case 'BOOLEAN':
      return (
        <Select id={id} value={value === true ? 'yes' : value === false ? 'no' : ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'yes')}>
          <option value="">Not set{def.defaultValue !== null && def.defaultValue !== undefined ? ` (default: ${def.defaultValue ? 'yes' : 'no'})` : ''}</option>
          <option value="yes">Yes</option><option value="no">No</option>
        </Select>
      );
    case 'INTEGER':
      return <Input id={id} type="number" min={0} max={10000} value={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} placeholder="Not set" />;
    case 'MONEY':
      return <Input id={id} type="number" min={0} step="0.5" value={typeof value === 'number' ? String(value / 100) : ''}
                    onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} placeholder="₹ not set" />;
    case 'TEXT':
      return <Input id={id} maxLength={300} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} placeholder="Not set" />;
    case 'DAYS': {
      const set = new Set(Array.isArray(value) ? (value as string[]) : []);
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={def.label}>
          {DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={set.has(d)} onChange={(e) => {
                const next = new Set(set);
                if (e.target.checked) next.add(d); else next.delete(d);
                onChange(next.size ? DAYS.filter((x) => next.has(x)) : null);
              }} />
              {d.slice(0, 3).charAt(0) + d.slice(1, 3).toLowerCase()}
            </label>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

/** Create or edit a plan: price and billing (fixed once created), limits, trial, visibility and features. */
export function PlanEditor({ plan, onClose }: { plan: PlanResponse | null; onClose: () => void }) {
  const qc = useQueryClient();
  const defs = useQuery({ queryKey: ['plan-features'], queryFn: api.admin.planFeatures });
  const [f, setF] = useState({
    code: plan?.code ?? '', name: plan?.name ?? '', description: plan?.description ?? '',
    price: plan ? String(plan.pricePaise / 100) : '', billingPeriod: plan?.billingPeriod ?? 'MONTHLY',
    maxDaysPerWeek: plan?.maxDaysPerWeek ?? 5, visibility: plan?.visibility ?? 'PUBLIC', trialDays: plan?.trialDays ?? 0,
    durationPeriods: plan?.durationPeriods ?? 0, maxSubscribers: plan?.maxSubscribers ?? 0, active: plan?.active ?? true,
    bullets: plan?.features.join('\n') ?? '',
  });
  const [values, setValues] = useState<Values>({ ...(plan?.entitlements ?? {}) });
  const save = useMutation({
    mutationFn: () => {
      const entitlements = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined)) as Schemas['PlanRequest']['entitlements'];
      const common = {
        name: f.name.trim(), description: f.description || undefined, maxDaysPerWeek: Number(f.maxDaysPerWeek),
        features: toLines(f.bullets), visibility: f.visibility as 'PUBLIC' | 'HIDDEN', trialDays: Number(f.trialDays), entitlements,
      };
      return plan
        ? api.admin.updatePlan(plan.id, { ...common, active: f.active, durationPeriods: Number(f.durationPeriods), maxSubscribers: Number(f.maxSubscribers) })
        : api.admin.createPlan({ ...common, code: f.code.toUpperCase(), pricePaise: Math.round(Number(f.price) * 100),
          billingPeriod: f.billingPeriod as 'MONTHLY' | 'QUARTERLY',
          durationPeriods: Number(f.durationPeriods) || undefined, maxSubscribers: Number(f.maxSubscribers) || undefined });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plans'] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={plan ? `Edit ${plan.name}` : 'New plan'}
                     description={plan ? 'Price and billing are fixed once a plan exists; create a new plan to change them.' : 'Everything parents see and every rule the plan applies.'}>
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          {save.error ? <Alert>{errorText(save.error)}</Alert> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Code" htmlFor="pe-code"><Input id="pe-code" required disabled={!!plan} value={f.code} onChange={set('code')} placeholder="MONTHLY_5" /></Field>
            <Field label="Name" htmlFor="pe-name"><Input id="pe-name" required value={f.name} onChange={set('name')} /></Field>
            <Field label="Price (₹)" htmlFor="pe-price"><Input id="pe-price" type="number" min={1} step="0.01" required disabled={!!plan} value={f.price} onChange={set('price')} /></Field>
            <Field label="Billing" htmlFor="pe-bill">
              <Select id="pe-bill" disabled={!!plan} value={f.billingPeriod} onChange={set('billingPeriod')}>
                <option value="MONTHLY">Every month</option><option value="QUARTERLY">Every 3 months</option>
              </Select>
            </Field>
            <Field label="Days a week" htmlFor="pe-days"><Input id="pe-days" type="number" min={1} max={7} value={f.maxDaysPerWeek} onChange={set('maxDaysPerWeek')} /></Field>
            <Field label="Visibility" htmlFor="pe-vis" hint="Hidden plans are not listed in the app; existing subscribers keep them.">
              <Select id="pe-vis" value={f.visibility} onChange={set('visibility')}>
                <option value="PUBLIC">Listed in the app</option><option value="HIDDEN">Hidden</option>
              </Select>
            </Field>
            <Field label="Free trial (days)" htmlFor="pe-trial" hint="One trial per family; 0 = no trial."><Input id="pe-trial" type="number" min={0} max={30} value={f.trialDays} onChange={set('trialDays')} /></Field>
            <Field label="Runs for (periods)" htmlFor="pe-dur" hint="0 = renews until cancelled."><Input id="pe-dur" type="number" min={0} max={36} value={f.durationPeriods} onChange={set('durationPeriods')} /></Field>
            <Field label="Subscriber limit" htmlFor="pe-max" hint="0 = no limit."><Input id="pe-max" type="number" min={0} value={f.maxSubscribers} onChange={set('maxSubscribers')} /></Field>
          </div>
          <Field label="Description" htmlFor="pe-desc"><Input id="pe-desc" maxLength={500} value={f.description} onChange={set('description')} /></Field>
          <Field label="Highlights on the plan card (one per line, up to 8)" htmlFor="pe-bul">
            <textarea id="pe-bul" rows={3} className={textareaClass} value={f.bullets} onChange={set('bullets')} placeholder={'Pickup on school days\nPhoto at handover'} />
          </Field>
          <fieldset className="rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">Plan features</legend>
            <p className="mb-3 text-xs text-muted-foreground">Features marked Applied are enforced by LunchBox; the rest are shown to parents. Add new feature types under Plan features below.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {defs.data?.filter((d) => d.active).map((d) => (
                <Field key={d.key} label={d.label} htmlFor={`feat-${d.key}`} hint={`${d.enforced ? 'Applied' : 'Shown to parents'}${d.description ? ` · ${d.description}` : ''}`}>
                  <FeatureInput def={d} value={values[d.key]} onChange={(v) => setValues({ ...values, [d.key]: v })} />
                </Field>
              ))}
            </div>
          </fieldset>
          {plan ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Available to buy</label>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>{plan ? 'Save plan' : 'Create plan'}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The kinds of features plans can have. New kinds need no code; built-in ones are enforced by the server. */
export function FeatureTypes({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const defs = useQuery({ queryKey: ['plan-features'], queryFn: api.admin.planFeatures });
  const [f, setF] = useState({ key: '', label: '', description: '', valueType: 'BOOLEAN' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['plan-features'] });
  const create = useMutation({
    mutationFn: () => api.admin.createPlanFeature({ key: f.key, label: f.label, description: f.description || undefined,
      valueType: f.valueType as FeatureDefinition['valueType'], active: true }),
    onSuccess: () => { setF({ key: '', label: '', description: '', valueType: 'BOOLEAN' }); void refresh(); },
  });
  const toggle = useMutation({
    mutationFn: (d: FeatureDefinition) => api.admin.updatePlanFeature(d.key, { key: d.key, label: d.label,
      description: d.description ?? undefined, valueType: d.valueType, displayOrder: d.displayOrder, active: !d.active }),
    onSuccess: () => void refresh(),
  });
  return (
    <div className="space-y-4">
      {create.error ?? toggle.error ? <Alert>{errorText(create.error ?? toggle.error)}</Alert> : null}
      <div className="lb-table-wrap"><table className="lb-table">
        <thead><tr><th>Feature</th><th>Type</th><th>How it works</th><th>Status</th><th /></tr></thead>
        <tbody>
          {defs.data?.map((d) => (
            <tr key={d.key}>
              <td><p className="font-medium">{d.label}</p><p className="text-xs text-muted-foreground"><code>{d.key}</code>{d.description ? ` · ${d.description}` : ''}</p></td>
              <td>{d.valueType.charAt(0) + d.valueType.slice(1).toLowerCase()}</td>
              <td>{d.enforced ? <Badge tone="success">Applied by LunchBox</Badge> : <Badge>Shown to parents</Badge>}</td>
              <td>{d.active ? 'In use' : 'Retired'}</td>
              <td>{editable && !d.enforced ? <Button size="sm" variant="ghost" onClick={() => toggle.mutate(d)}>{d.active ? 'Retire' : 'Use again'}</Button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {editable ? (
        <form className="grid items-end gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Key" htmlFor="ft-key" hint="Lowercase, e.g. insulated_bag"><Input id="ft-key" required pattern="^[a-z][a-z0-9_]{1,59}$" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>
          <Field label="Label" htmlFor="ft-label"><Input id="ft-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          <Field label="Type" htmlFor="ft-type">
            <Select id="ft-type" value={f.valueType} onChange={(e) => setF({ ...f, valueType: e.target.value })}>
              <option value="BOOLEAN">Yes / no</option><option value="INTEGER">Number</option><option value="MONEY">Amount (₹)</option>
              <option value="DAYS">Days</option><option value="TEXT">Text</option>
            </Select>
          </Field>
          <Field label="Description" htmlFor="ft-desc"><Input id="ft-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Button type="submit" disabled={create.isPending}>Add feature type</Button>
        </form>
      ) : null}
    </div>
  );
}

function CouponEditor({ coupon, plans, onClose }: { coupon: Coupon | null; plans: PlanResponse[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: coupon?.code ?? '', description: coupon?.description ?? '', kind: coupon?.kind ?? 'PERCENT',
    amount: coupon ? (coupon.kind === 'FLAT' ? String(coupon.amount / 100) : String(coupon.amount)) : '10',
    maxDiscount: coupon?.maxDiscountPaise ? String(coupon.maxDiscountPaise / 100) : '', validFrom: coupon?.validFrom ?? '',
    validTo: coupon?.validTo ?? '', maxRedemptions: coupon?.maxRedemptions ? String(coupon.maxRedemptions) : '',
    planIds: coupon?.planIds ?? [], firstOnly: coupon?.firstSubscriptionOnly ?? false, active: coupon?.active ?? true,
  });
  const save = useMutation({
    mutationFn: () => {
      const body: Schemas['CouponRequest'] = {
        code: f.code.trim().toUpperCase(), description: f.description || undefined, kind: f.kind as 'PERCENT' | 'FLAT',
        amount: f.kind === 'FLAT' ? Math.round(Number(f.amount) * 100) : Number(f.amount),
        maxDiscountPaise: f.maxDiscount ? Math.round(Number(f.maxDiscount) * 100) : undefined,
        validFrom: f.validFrom || undefined, validTo: f.validTo || undefined,
        maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : undefined, planIds: f.planIds,
        firstSubscriptionOnly: f.firstOnly, active: f.active,
      };
      return coupon ? api.admin.updateCoupon(coupon.id, body) : api.admin.createCoupon(body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['coupons'] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={coupon ? `Edit ${coupon.code}` : 'New coupon'} description="Discounts apply to the Razorpay order; ₹1 always remains to pay.">
        <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          {save.error ? <Alert>{errorText(save.error)}</Alert> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Code" htmlFor="cp-code"><Input id="cp-code" required disabled={!!coupon} value={f.code} onChange={set('code')} placeholder="WELCOME10" /></Field>
            <Field label="Kind" htmlFor="cp-kind">
              <Select id="cp-kind" value={f.kind} onChange={set('kind')}><option value="PERCENT">Percent off</option><option value="FLAT">Rupees off</option></Select>
            </Field>
            <Field label={f.kind === 'PERCENT' ? 'Percent' : 'Rupees'} htmlFor="cp-amount"><Input id="cp-amount" type="number" min={1} max={f.kind === 'PERCENT' ? 100 : undefined} required value={f.amount} onChange={set('amount')} /></Field>
            <Field label="Cap (₹, optional)" htmlFor="cp-cap"><Input id="cp-cap" type="number" min={1} value={f.maxDiscount} onChange={set('maxDiscount')} /></Field>
            <Field label="Valid from" htmlFor="cp-from"><Input id="cp-from" type="date" value={f.validFrom} onChange={set('validFrom')} /></Field>
            <Field label="Valid to" htmlFor="cp-to"><Input id="cp-to" type="date" value={f.validTo} onChange={set('validTo')} /></Field>
            <Field label="Total uses (optional)" htmlFor="cp-max"><Input id="cp-max" type="number" min={1} value={f.maxRedemptions} onChange={set('maxRedemptions')} /></Field>
            <Field label="Description" htmlFor="cp-desc"><Input id="cp-desc" value={f.description} onChange={set('description')} /></Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Plans (none = every plan)</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {plans.map((p) => (
                <label key={p.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={f.planIds.includes(p.id)}
                         onChange={(e) => setF({ ...f, planIds: e.target.checked ? [...f.planIds, p.id] : f.planIds.filter((x) => x !== p.id) })} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.firstOnly} onChange={(e) => setF({ ...f, firstOnly: e.target.checked })} /> First paid plan only</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>{coupon ? 'Save coupon' : 'Create coupon'}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Coupons({ editable, plans }: { editable: boolean; plans: PlanResponse[] }) {
  const coupons = useQuery({ queryKey: ['coupons'], queryFn: api.admin.coupons });
  const [editing, setEditing] = useState<Coupon | null | 'new'>(null);
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? 'Unknown plan';
  return (
    <div className="space-y-3">
      {coupons.error ? <Alert>{errorText(coupons.error)}</Alert> : null}
      <div className="lb-table-wrap"><table className="lb-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Used</th><th>Plans</th><th>Status</th><th /></tr></thead>
        <tbody>
          {coupons.data?.length === 0 ? <tr><td colSpan={7} className="text-center text-sm text-muted-foreground">No coupons yet.</td></tr> : null}
          {coupons.data?.map((c) => (
            <tr key={c.id}>
              <td><code className="font-semibold">{c.code}</code>{c.description ? <p className="text-xs text-muted-foreground">{c.description}</p> : null}</td>
              <td>{c.kind === 'PERCENT' ? `${c.amount}%` : rupees(c.amount)}{c.maxDiscountPaise ? ` (up to ${rupees(c.maxDiscountPaise)})` : ''}{c.firstSubscriptionOnly ? ' · first plan' : ''}</td>
              <td className="text-xs">{c.validFrom ? istDate(c.validFrom) : 'Any time'} – {c.validTo ? istDate(c.validTo) : 'no end'}</td>
              <td className="tabular">{c.redeemed}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</td>
              <td className="text-xs">{c.planIds.length ? c.planIds.map(planName).join(', ') : 'All plans'}</td>
              <td>{c.active ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>}</td>
              <td>{editable ? <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {editable ? <Button variant="outline" onClick={() => setEditing('new')}>New coupon</Button> : null}
      {editing ? <CouponEditor coupon={editing === 'new' ? null : editing} plans={plans} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
