'use client';

import { istTime, todayIst } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, PageHeader } from '@/components/ui/primitives';
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
  return (
    <AppShell roles={['SCHOOL_ADMIN']}>
      <PageHeader title="Today's incoming lunchboxes" description={date} />
      {orders.error ?? confirm.error ? <Alert>{errorText(orders.error ?? confirm.error)}</Alert> : null}
      <table className="w-full rounded-lg border bg-card text-sm">
        <thead className="bg-muted/60 text-left"><tr><th className="p-2">Child</th><th>Class</th><th>Status</th><th>Delivered</th><th>Receipt</th></tr></thead>
        <tbody>
          {orders.data?.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="p-2">{o.childName}</td>
              <td>{o.className}{o.section ? `-${o.section}` : ''}</td>
              <td><StatusBadge status={o.status} /></td>
              <td>{istTime(o.deliveredAt)}</td>
              <td>
                {o.schoolReceivedAt ? `Confirmed ${istTime(o.schoolReceivedAt)}` : o.status === 'DELIVERED'
                  ? <Button size="sm" onClick={() => confirm.mutate(o.id)}>Confirm received</Button> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
