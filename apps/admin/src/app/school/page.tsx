'use client';

import { istTime, todayIst } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, School } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

/** School admins see only their own school's lunchboxes for today, with child name and class (no addresses). */
export default function SchoolAdminPage() {
  const qc = useQueryClient();
  const date = todayIst();
  const orders = useQuery({ queryKey: ['school-orders', date], queryFn: () => api.schoolAdmin.orders(date), refetchInterval: 30_000 });
  const confirm = useMutation({
    mutationFn: api.schoolAdmin.confirmReceipt,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-orders'] }),
  });
  const list = orders.data ?? [];
  const delivered = list.filter((o) => o.status === 'DELIVERED').length;
  const received = list.filter((o) => o.schoolReceivedAt).length;
  const toConfirm = delivered - received;
  const pct = list.length > 0 ? (delivered / list.length) * 100 : 0;

  return (
    <AppShell roles={['SCHOOL_ADMIN']}>
      <PageHeader eyebrow={date} title="Today's incoming lunchboxes"
                  description="Lunchboxes on their way to your school. Confirm each one once it reaches the class." />
      {orders.error ?? confirm.error ? <div className="mb-4"><Alert>{errorText(orders.error ?? confirm.error)}</Alert></div> : null}

      <Card className="paper-grain mb-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Delivered</p>
            <p className="tabular mt-1 text-[40px] font-semibold leading-none tracking-tight">
              {delivered}<span className="text-xl text-muted-foreground"> / {list.length}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {toConfirm > 0 ? <><span className="font-semibold text-foreground">{toConfirm}</span> waiting for your confirmation</> : `${received} confirmed received`}
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, backgroundColor: 'var(--chart-done)' }} />
        </div>
      </Card>

      <div className="lb-table-wrap">
        <table className="lb-table">
          <caption className="sr-only">Today's lunchboxes</caption>
          <thead><tr><th>Child</th><th>Class</th><th>Status</th><th>Delivered</th><th>Receipt</th></tr></thead>
          <tbody>
            {orders.isLoading ? Array.from({ length: 4 }, (_, i) => (
              <tr key={i}>{Array.from({ length: 5 }, (__, c) => <td key={c}><Skeleton className="h-4 w-20" /></td>)}</tr>
            )) : null}
            {list.map((o) => (
              <tr key={o.id}>
                <td className="font-medium">{o.childName}</td>
                <td className="tabular">{o.className}{o.section ? `-${o.section}` : ''}</td>
                <td><StatusBadge status={o.status} /></td>
                <td className="tabular">{istTime(o.deliveredAt)}</td>
                <td>
                  {o.schoolReceivedAt ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                      <CircleCheck className="h-4 w-4" aria-hidden />Confirmed {istTime(o.schoolReceivedAt)}
                    </span>
                  ) : o.status === 'DELIVERED'
                    ? <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate(o.id)}>Confirm received</Button>
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.data && list.length === 0 ? <EmptyState icon={School} title="No lunchboxes today" description="Holidays and leave days are already taken into account." /> : null}
      </div>
    </AppShell>
  );
}
