'use client';

import { addDays, istDateTime, rupees, todayIst, type AdminPayment } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useDebounced } from '@/lib/useDebounced';

const STATUSES = ['', 'CAPTURED', 'AUTHORIZED', 'FAILED', 'REFUNDED', 'CREATED'] as const;
const STATUS_LABEL: Record<string, string> = {
  CAPTURED: 'Received', AUTHORIZED: 'Authorised', FAILED: 'Failed', REFUNDED: 'Refunded', CREATED: 'Started',
};

/** Every plan payment: who paid, for what, how, and the Razorpay reference to look it up. */
export default function PaymentsPage() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(addDays(todayIst(), -30));
  const [to, setTo] = useState(todayIst());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const search = useDebounced(q.trim(), 300);
  const fromIso = `${from}T00:00:00+05:30`;
  const toIso = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();
  const payments = useQuery({
    queryKey: ['admin-payments', status, from, to, search, page],
    queryFn: () => api.admin.payments({ status: status || undefined, from: new Date(fromIso).toISOString(), to: toIso,
      q: search || undefined, page, size: 50 }),
  });
  const items = payments.data?.items ?? [];
  const received = items.filter((p) => p.status === 'CAPTURED').reduce((s, p) => s + p.amountPaise, 0);

  const columns = useMemo<ColumnDef<AdminPayment, unknown>[]>(() => [
    { header: 'When', cell: ({ row }) => <span className="tabular whitespace-nowrap">{istDateTime(row.original.paidAt ?? row.original.createdAt)}</span> },
    { header: 'Parent', cell: ({ row }) => row.original.parentName ?? <span className="text-muted-foreground">Deleted account</span> },
    { header: 'For', accessorKey: 'description' },
    { header: 'Amount', cell: ({ row }) => <span className="tabular font-medium">{rupees(row.original.amountPaise)}</span> },
    { header: 'Method', cell: ({ row }) => (row.original.method ? row.original.method.toUpperCase() : '—') },
    { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: 'Razorpay ID', cell: ({ row }) => (row.original.transactionId
      ? <code className="text-xs">{row.original.transactionId}</code> : <span className="text-muted-foreground">—</span>) },
    { header: 'Note', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.failureReason ?? ''}</span> },
  ], []);

  return (
    <AppShell>
      <PageHeader eyebrow="Money" title="Payments" description="Plan payments from parents through Razorpay. Card details never reach LunchBox." />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <Field label="From" htmlFor="p-from"><Input id="p-from" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></Field>
        <Field label="To" htmlFor="p-to"><Input id="p-to" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></Field>
        <Field label="Status" htmlFor="p-status">
          <Select id="p-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? STATUS_LABEL[s] : 'All'}</option>)}
          </Select>
        </Field>
        <Field label="Search" htmlFor="p-q"><Input id="p-q" type="search" value={q} placeholder="Razorpay ID or plan" onChange={(e) => { setQ(e.target.value); setPage(0); }} /></Field>
        <p className="ml-auto pb-2 text-sm text-muted-foreground">
          {payments.data ? <>{payments.data.totalElements} payments · <b className="tabular text-foreground">{rupees(received)}</b> received on this page</> : null}
        </p>
      </div>
      {payments.error ? <Alert>{errorText(payments.error)}</Alert> : null}
      <DataTable caption="Payments" columns={columns} data={items} page={page} totalPages={payments.data?.totalPages ?? 0}
                 totalElements={payments.data?.totalElements ?? 0} onPageChange={setPage} loading={payments.isLoading}
                 emptyTitle="No payments in this range" emptyDescription="Try a wider date range or another status." />
    </AppShell>
  );
}
