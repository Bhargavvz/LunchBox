'use client';

import { addDays, istDate, istDateTime, rupees, todayIst } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function PayoutsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [periodEnd, setPeriodEnd] = useState(addDays(todayIst(), -1));
  const payouts = useQuery({ queryKey: ['payouts', status], queryFn: () => api.admin.payouts(status || undefined) });
  const run = useMutation({ mutationFn: () => api.admin.runPayouts(periodEnd), onSuccess: () => qc.invalidateQueries({ queryKey: ['payouts'] }) });
  return (
    <AppShell>
      <PageHeader eyebrow="Money" title="Partner payouts" description="Weekly payouts run automatically every Monday 10:00 IST via RazorpayX." />
      {payouts.error ?? run.error ? <Alert>{errorText(payouts.error ?? run.error)}</Alert> : null}
      {run.data ? <Alert tone="success">Created {run.data.created} payouts totalling {rupees(run.data.totalPaise)}.</Alert> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status" htmlFor="po-status">
          <Select id="po-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'REVERSED'].map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </Select>
        </Field>
        {can('SUPER_ADMIN') ? (
          <>
            <Field label="Pay earnings up to" htmlFor="po-end"><Input id="po-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
            <Button disabled={run.isPending} onClick={() => run.mutate()}>Run payouts now</Button>
          </>
        ) : null}
      </div>
      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead><tr><th>Partner</th><th>Period</th><th>Amount</th><th>Status</th><th>UTR</th><th>Processed</th><th>Failure</th></tr></thead>
          <tbody>
            {payouts.data?.items.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.partnerId.slice(0, 8)}</td>
                <td>{istDate(p.periodStart)} – {istDate(p.periodEnd)}</td>
                <td className="font-semibold">{rupees(p.amountPaise)}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>{p.utr ?? '—'}</td><td>{istDateTime(p.processedAt)}</td><td>{p.failureReason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
