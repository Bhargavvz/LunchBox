'use client';

import { istDateTime, istTime, todayIst, type AdminOrder } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Dialog, DialogContent, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { downloadBlob } from '@/lib/utils';

const STATUSES = ['', 'SCHEDULED', 'ASSIGNED', 'REASSIGNED', 'PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL',
  'DELIVERED', 'CANCELLED', 'PICKUP_FAILED', 'DELIVERY_FAILED'];

function OrderDialog({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['admin-order', order.id], queryFn: () => api.admin.order(order.id) });
  const nearby = useQuery({
    queryKey: ['nearby', order.pickupLocation.lat, order.pickupLocation.lng],
    queryFn: () => api.admin.nearbyPartners(order.pickupLocation.lat, order.pickupLocation.lng, 5000),
    enabled: order.scheduledDate === todayIst(),
  });
  const partners = useQuery({ queryKey: ['partners-approved'], queryFn: () => api.admin.partners({ kycStatus: 'APPROVED', size: 200 }) });
  const [partnerId, setPartnerId] = useState('');
  const [reason, setReason] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-orders'] });
    void qc.invalidateQueries({ queryKey: ['admin-order', order.id] });
  };
  const assign = useMutation({ mutationFn: () => api.admin.assignOrder(order.id, partnerId, reason || undefined), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => api.admin.cancelOrder(order.id, reason), onSuccess: refresh });
  const canAssign = ['SCHEDULED', 'REASSIGNED', 'ASSIGNED'].includes(order.status);
  const canCancel = ['SCHEDULED', 'ASSIGNED', 'REASSIGNED', 'PARTNER_EN_ROUTE'].includes(order.status);
  const err = assign.error ?? cancel.error;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${order.childName ?? 'Order'} · ${order.scheduledDate}`} description={order.schoolName ?? undefined}>
        {err ? <Alert>{errorText(err)}</Alert> : null}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Status</span><StatusBadge status={order.status} />
          <span className="text-muted-foreground">Pickup window</span><span>{istTime(order.pickupWindowStart)}–{istTime(order.pickupWindowEnd)}</span>
          <span className="text-muted-foreground">Deadline</span><span>{istTime(order.deliveryDeadline)}</span>
          <span className="text-muted-foreground">Partner</span><span>{order.partnerId ?? 'Unassigned'}</span>
          {order.failureReason ? (<><span className="text-muted-foreground">Failure</span><span>{order.failureReason}</span></>) : null}
        </div>
        <section>
          <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
          <ol className="space-y-1 text-sm">
            {detail.data?.timeline.map((e, i) => (
              <li key={i}><StatusBadge status={e.status} /> <span className="text-muted-foreground">{istDateTime(e.occurredAt)}</span> {e.reason ?? ''}</li>
            ))}
          </ol>
        </section>
        {can('SUPER_ADMIN', 'OPS_ADMIN') ? (
          <section className="space-y-3">
            <Field label="Reason (required to cancel)" htmlFor="reason">
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
            {canAssign ? (
              <Field label="Assign to partner" htmlFor="partner">
                <Select id="partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full">
                  <option value="">Choose…</option>
                  {nearby.data?.length ? (
                    <optgroup label="Nearby now">
                      {nearby.data.map((p) => <option key={`n-${p.partnerId}`} value={p.partnerId}>{p.name} · {p.activeOrders} active</option>)}
                    </optgroup>
                  ) : null}
                  <optgroup label="All approved partners">
                    {partners.data?.items.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName ?? ''} · cap {p.capacity}</option>)}
                  </optgroup>
                </Select>
              </Field>
            ) : null}
            <div className="flex gap-2">
              {canAssign ? <Button disabled={!partnerId || assign.isPending} onClick={() => assign.mutate()}>Assign</Button> : null}
              {canCancel ? (
                <Button variant="destructive" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()}>
                  Cancel order
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function OrdersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIst());
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const orders = useQuery({
    queryKey: ['admin-orders', date, status, page],
    queryFn: () => api.admin.orders({ date, status: status || undefined, page, size: 50 }),
    refetchInterval: 30_000,
  });
  const generate = useMutation({ mutationFn: () => api.admin.generateOrders(date), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }) });
  const autoAssign = useMutation({ mutationFn: () => api.admin.autoAssign(date), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }) });

  const columns = useMemo<ColumnDef<AdminOrder, unknown>[]>(() => [
    { header: 'Child', cell: ({ row }) => <button className="text-left font-medium text-primary underline-offset-2 hover:underline" onClick={() => setSelected(row.original)}>{row.original.childName}</button> },
    { header: 'Class', accessorKey: 'className' },
    { header: 'School', accessorKey: 'schoolName' },
    { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: 'Pickup', cell: ({ row }) => `${istTime(row.original.pickupWindowStart)}–${istTime(row.original.pickupWindowEnd)}` },
    { header: 'Delivered', cell: ({ row }) => istTime(row.original.deliveredAt) },
    { header: 'Partner', cell: ({ row }) => (row.original.partnerId ? row.original.partnerId.slice(0, 8) : '—') },
  ], []);

  async function exportCsv() {
    const blob = await api.admin.downloadCsv('/api/v1/admin/orders/export.csv', { date, status: status || undefined });
    downloadBlob(blob, `orders-${date}.csv`);
  }

  return (
    <AppShell>
      <PageHeader title="Orders" description="Search, assign, reassign and cancel deliveries"
        actions={<>
          <Button variant="outline" onClick={() => void exportCsv()}>Export CSV</Button>
          {can('SUPER_ADMIN', 'OPS_ADMIN') ? <>
            <Button variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>Generate orders</Button>
            <Button disabled={autoAssign.isPending} onClick={() => autoAssign.mutate()}>Auto-assign</Button>
          </> : null}
        </>} />
      {orders.error ? <Alert>{errorText(orders.error)}</Alert> : null}
      {generate.data ? <Alert tone="success">Generated {generate.data.created} orders ({generate.data.skipped} skipped).</Alert> : null}
      {autoAssign.data ? <Alert tone="success">Assigned {autoAssign.data.assigned} of {autoAssign.data.considered}; {autoAssign.data.unassigned} still unassigned.</Alert> : null}
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Date" htmlFor="date"><Input id="date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(0); }} /></Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </Select>
        </Field>
      </div>
      <DataTable caption="Orders" columns={columns} data={orders.data?.items ?? []} page={page}
                 totalPages={orders.data?.totalPages ?? 0} totalElements={orders.data?.totalElements ?? 0}
                 onPageChange={setPage} loading={orders.isLoading} />
      {selected ? <OrderDialog order={selected} onClose={() => setSelected(null)} /> : null}
    </AppShell>
  );
}
