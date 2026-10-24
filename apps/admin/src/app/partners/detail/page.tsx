'use client';

import { addDays, istDate, istTime, todayIst } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DOC_TYPES = ['AADHAAR', 'PAN', 'DRIVING_LICENSE', 'VEHICLE_RC', 'PHOTO', 'POLICE_VERIFICATION'] as const;

function KycSection({ partnerId }: { partnerId: string }) {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ['kyc', partnerId], queryFn: () => api.admin.kycDocuments(partnerId) });
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>('AADHAAR');
  const [number, setNumber] = useState('');
  const [dob, setDob] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['kyc', partnerId] });
    void qc.invalidateQueries({ queryKey: ['partner', partnerId] });
  };
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file');
      const contentType = file.type === 'application/pdf' ? 'application/pdf' : file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const target = await api.admin.kycUploadUrl(partnerId, { docType, contentType });
      const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await api.admin.addKycDocument(partnerId, { docType, s3Key: target.key, documentNumber: number || undefined, dateOfBirth: dob || undefined });
    },
    onSuccess: () => { setFile(null); setNumber(''); refresh(); },
  });
  const review = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => api.admin.reviewKycDocument(partnerId, id, ok),
    onSuccess: refresh,
  });
  const decide = useMutation({
    mutationFn: (approved: boolean) => api.admin.kycDecision(partnerId, { approved, notes: notes || undefined }),
    onSuccess: refresh,
  });
  const err = upload.error ?? review.error ?? decide.error;
  return (
    <Card className="space-y-4">
      <CardTitle>KYC documents</CardTitle>
      {err ? <Alert>{errorText(err)}</Alert> : null}
      <table className="lb-table">
        <thead><tr><th>Type</th><th>Number</th><th>Status</th><th>File</th><th /></tr></thead>
        <tbody>
          {docs.data?.map((d) => (
            <tr key={d.id}>
              <td>{d.docType}</td>
              <td>{d.documentNumberMasked ?? '—'}</td>
              <td><StatusBadge status={d.status} /></td>
              <td><a className="text-primary underline" href={d.viewUrl} target="_blank" rel="noreferrer">View</a></td>
              <td className="space-x-2 py-1">
                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: d.id, ok: true })}>Verified</Button>
                <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: d.id, ok: false })}>Reject</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Document" htmlFor="doc-type">
          <Select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}>
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Number" htmlFor="doc-no"><Input id="doc-no" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="Date of birth (licence)" htmlFor="doc-dob"><Input id="doc-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
        <Field label="File (JPEG, PNG or PDF)" htmlFor="doc-file">
          <Input id="doc-file" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
      <Button disabled={!file || upload.isPending} onClick={() => upload.mutate()}>Upload document</Button>
      <Field label="Review notes" htmlFor="kyc-notes"><Textarea id="kyc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex gap-2">
        <Button onClick={() => decide.mutate(true)} disabled={decide.isPending}>Approve partner</Button>
        <Button variant="destructive" onClick={() => decide.mutate(false)} disabled={decide.isPending}>Reject</Button>
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
          <StatusBadge status={p.kycStatus} />
          <span>Payout account: {p.payoutAccountLinked ? 'linked' : 'not linked'}</span>
          {p.kycNotes ? <span className="text-muted-foreground">Notes: {p.kycNotes}</span> : null}
        </div>
      ) : null}
      <div className="space-y-6">
        {can('SUPER_ADMIN', 'OPS_ADMIN') ? <KycSection partnerId={id} /> : null}
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
