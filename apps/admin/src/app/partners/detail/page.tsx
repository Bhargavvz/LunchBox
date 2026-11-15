'use client';

import { addDays, istDate, istTime, todayIst } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, CardTitle, Field, Input, PageHeader, Textarea } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Operations' go/no-go on a rider. Check identity and police verification offline before approving. */
function ApprovalSection({ partnerId, status }: { partnerId: string; status: string }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const decide = useMutation({
    mutationFn: (approved: boolean) => api.admin.decidePartner(partnerId, { approved, notes: notes || undefined }),
    onSuccess: () => {
      setNotes('');
      void qc.invalidateQueries({ queryKey: ['partner', partnerId] });
    },
  });
  return (
    <Card className="space-y-4">
      <CardTitle>Approval</CardTitle>
      <p className="text-sm text-muted-foreground">
        Only approved riders can be given shifts and sign in to the partner app. Check their ID, licence and police
        verification in person before approving.
      </p>
      {decide.error ? <Alert>{errorText(decide.error)}</Alert> : null}
      <Field label="Notes (what you checked)" htmlFor="approval-notes">
        <Textarea id="approval-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={() => decide.mutate(true)} disabled={decide.isPending || status === 'APPROVED'}>Approve rider</Button>
        <Button variant="destructive" onClick={() => decide.mutate(false)} disabled={decide.isPending || status === 'REJECTED'}>
          Reject
        </Button>
      </div>
    </Card>
  );
}

function ShiftsSection({ partnerId }: { partnerId: string }) {
  const qc = useQueryClient();
  const from = todayIst();
  const to = addDays(from, 14);
  const shifts = useQuery({ queryKey: ['shifts', partnerId], queryFn: () => api.admin.shifts(partnerId, from, to) });
  const [date, setDate] = useState(addDays(from, 1));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('13:00');
  const schedule = useMutation({
    mutationFn: () => api.admin.scheduleShift(partnerId, { date, plannedStart: start, plannedEnd: end }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', partnerId] }),
  });
  const cancel = useMutation({
    mutationFn: (d: string) => api.admin.cancelShift(partnerId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', partnerId] }),
  });
  return (
    <Card className="space-y-3">
      <CardTitle>Shifts (next 14 days)</CardTitle>
      {schedule.error ?? cancel.error ? <Alert>{errorText(schedule.error ?? cancel.error)}</Alert> : null}
      <ul className="text-sm">
        {shifts.data?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 border-t py-1">
            <span className="w-28">{istDate(s.date)}</span>
            <span>{istTime(s.plannedStart)}–{istTime(s.plannedEnd)}</span>
            <StatusBadge status={s.status} />
            {s.status === 'SCHEDULED' ? <Button size="sm" variant="ghost" onClick={() => cancel.mutate(s.date)}>Cancel</Button> : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" htmlFor="s-date"><Input id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Start (IST)" htmlFor="s-start"><Input id="s-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End (IST)" htmlFor="s-end"><Input id="s-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Button onClick={() => schedule.mutate()} disabled={schedule.isPending}>Schedule</Button>
      </div>
    </Card>
  );
}

function PayoutSection({ partnerId }: { partnerId: string }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const bank = useMutation({
    mutationFn: () => api.admin.linkBankAccount(partnerId, { accountHolder: holder, accountNumber: account, ifsc: ifsc.toUpperCase() }),
    onSuccess: () => { setAccount(''); void qc.invalidateQueries({ queryKey: ['partner', partnerId] }); },
  });
  const adjust = useMutation({
    mutationFn: () => api.admin.adjustEarnings(partnerId, { date: todayIst(), amountPaise: Math.round(Number(amount) * 100), reason }),
    onSuccess: () => { setAmount(''); setReason(''); },
  });
  if (!can('SUPER_ADMIN')) return null;
  return (
    <Card className="space-y-3">
      <CardTitle>Payout account & adjustments</CardTitle>
      {bank.error ?? adjust.error ? <Alert>{errorText(bank.error ?? adjust.error)}</Alert> : null}
      {adjust.isSuccess ? <Alert tone="success">Adjustment recorded.</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Account holder" htmlFor="b-holder"><Input id="b-holder" value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
        <Field label="Account number" htmlFor="b-acc"><Input id="b-acc" value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="off" /></Field>
        <Field label="IFSC" htmlFor="b-ifsc"><Input id="b-ifsc" value={ifsc} onChange={(e) => setIfsc(e.target.value)} /></Field>
      </div>
      <Button variant="outline" disabled={bank.isPending} onClick={() => bank.mutate()}>Link bank account (RazorpayX)</Button>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Adjustment (₹, negative for penalty)" htmlFor="a-amt"><Input id="a-amt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason" htmlFor="a-reason"><Input id="a-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <Button variant="outline" disabled={!amount || reason.length < 3 || adjust.isPending} onClick={() => adjust.mutate()}>Record adjustment</Button>
    </Card>
  );
}

function PartnerDetail() {
  const id = useSearchParams().get('id') ?? '';
  const qc = useQueryClient();
  const { can } = useAuth();
  const partner = useQuery({ queryKey: ['partner', id], queryFn: () => api.admin.partner(id), enabled: !!id });
  const toggle = useMutation({
    mutationFn: (active: boolean) => (active ? api.admin.activatePartner(id) : api.admin.deactivatePartner(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner', id] }),
  });
  if (!id) return <Alert>Missing partner id.</Alert>;
  if (partner.error) return <Alert>{errorText(partner.error)}</Alert>;
  const p = partner.data;
  return (
    <>
      <PageHeader
        title={p ? `${p.firstName} ${p.lastName ?? ''}` : 'Partner'}
        description={p ? `${p.phone ?? ''} · ${p.vehicleType} ${p.vehicleNumber ?? ''} · capacity ${p.capacity}` : undefined}
        actions={p && can('SUPER_ADMIN', 'OPS_ADMIN') ? (
          <Button variant={p.active ? 'destructive' : 'default'} onClick={() => toggle.mutate(!p.active)}>
            {p.active ? 'Deactivate' : 'Activate'}
          </Button>
        ) : null}
      />
      {p ? (
        <div className="mb-4 flex gap-3 text-sm">
          <StatusBadge status={p.approvalStatus} />
          <span>Payout account: {p.payoutAccountLinked ? 'linked' : 'not linked'}</span>
          {p.approvalNotes ? <span className="text-muted-foreground">Notes: {p.approvalNotes}</span> : null}
        </div>
      ) : null}
      <div className="space-y-6">
        {p && can('SUPER_ADMIN', 'OPS_ADMIN') ? <ApprovalSection partnerId={id} status={p.approvalStatus} /> : null}
        <ShiftsSection partnerId={id} />
        <PayoutSection partnerId={id} />
      </div>
    </>
  );
}

export default function PartnerDetailPage() {
  return (
    <AppShell>
      <Suspense fallback={<p>Loading…</p>}>
        <PartnerDetail />
      </Suspense>
    </AppShell>
  );
}
