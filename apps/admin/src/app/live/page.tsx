'use client';

import { istTime, todayIst, type AdminOrder, type FleetPartner, type LivePartnerMessage } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { InfoWindow, Marker } from '@vis.gl/react-google-maps';
import { Phone, Radio } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { MapFrame } from '@/components/maps';
import { StatusBadge, statusLabel } from '@/components/StatusBadge';
import { Alert, Badge, Card, CardHeader, EmptyState, Field, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText, realtime } from '@/lib/api';
import { cn } from '@/lib/utils';

type Availability = FleetPartner['availability'];

const AVAILABILITY: Record<Availability, { label: string; tone: 'success' | 'warning' | 'default'; color: string }> = {
  ONLINE: { label: 'Online', tone: 'success', color: '#2F8F4E' },
  BUSY: { label: 'Busy', tone: 'warning', color: '#E09A2B' },
  OFFLINE: { label: 'Offline', tone: 'default', color: '#8E9A95' },
};

const ONGOING = ['ASSIGNED', 'REASSIGNED', 'PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL'];

/** +919876543210 → +91 98765 43210 */
const phoneText = (p?: string | null) => (p ? p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : '—');

/**
 * Operations view of the fleet: every rider on shift today on a map (positions stream in over STOMP), who is online,
 * busy or offline, and what each one is carrying; below it, today's open deliveries with a status filter.
 */
export default function LiveTrackingPage() {
  const date = todayIst();
  const fleet = useQuery({ queryKey: ['fleet'], queryFn: api.admin.fleet, refetchInterval: 15_000 });
  const [positions, setPositions] = useState<Record<string, LivePartnerMessage>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [show, setShow] = useState<Availability | 'ALL'>('ALL');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const orders = useQuery({
    queryKey: ['live-orders', date, status, page],
    queryFn: () => api.admin.orders({ date, status: status || undefined, page, size: 50 }),
    refetchInterval: 15_000,
  });

  // Live positions between the 15-second refreshes.
  useEffect(() => {
    realtime.connect();
    return realtime.subscribeAdminLive((m) => setPositions((cur) => ({ ...cur, [m.partnerId]: m })));
  }, []);

  const riders = useMemo(() => (fleet.data ?? []).map((r) => {
    const live = positions[r.partnerId];
    const fresher = live && (!r.location || new Date(live.at) > new Date(r.location.recordedAt));
    return { ...r, lat: fresher ? live.lat : r.location?.lat, lng: fresher ? live.lng : r.location?.lng,
      seenAt: fresher ? live.at : r.location?.recordedAt };
  }), [fleet.data, positions]);
  const visible = riders.filter((r) => show === 'ALL' || r.availability === show);
  const onMap = visible.filter((r) => r.lat !== undefined && r.lng !== undefined);
  const current = riders.find((r) => r.partnerId === selected) ?? null;
  const counts = (a: Availability) => riders.filter((r) => r.availability === a).length;
  const center = onMap[0] ? { lat: onMap[0].lat!, lng: onMap[0].lng! } : undefined;

  const rows = (orders.data?.items ?? []).filter((o) => status || ONGOING.includes(o.status));
  const riderName = (id?: string | null) => riders.find((r) => r.partnerId === id)?.name ?? '—';
  const columns: ColumnDef<AdminOrder, unknown>[] = [
    { header: 'Child', cell: ({ row }) => <span className="font-medium">{row.original.childName}</span> },
    { header: 'School', accessorKey: 'schoolName' },
    { header: 'Rider', cell: ({ row }) => row.original.partnerId
      ? <button type="button" className="text-primary hover:underline" onClick={() => setSelected(row.original.partnerId!)}>{riderName(row.original.partnerId)}</button>
      : <span className="text-muted-foreground">Unassigned</span> },
    { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: 'Picked up', cell: ({ row }) => istTime(row.original.pickedUpAt) || '—' },
    { header: 'Due at school', cell: ({ row }) => istTime(row.original.deliveryDeadline) },
  ];

  return (
    <AppShell>
      <PageHeader eyebrow="Operations" title="Live tracking"
                  description="Riders on shift today and every lunchbox still on its way. Updates by itself." />
      {fleet.error ? <Alert title="Could not load riders">{errorText(fleet.error)}</Alert> : null}

      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Show riders">
        {(['ALL', 'ONLINE', 'BUSY', 'OFFLINE'] as const).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={show === a} onClick={() => setShow(a)}
                  className={cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    show === a ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {a === 'ALL' ? `All riders · ${riders.length}` : `${AVAILABILITY[a].label} · ${counts(a)}`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <MapFrame label="Riders on the map" height={520} center={center} zoom={13}>
          {onMap.map((r) => (
            <Marker key={r.partnerId} position={{ lat: r.lat!, lng: r.lng! }} title={r.name ?? ''} onClick={() => setSelected(r.partnerId)}
                    icon={{ path: google.maps.SymbolPath.CIRCLE, scale: r.partnerId === selected ? 10 : 8,
                      fillColor: AVAILABILITY[r.availability].color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }} />
          ))}
          {current && current.lat !== undefined && current.lng !== undefined ? (
            <InfoWindow position={{ lat: current.lat, lng: current.lng }} onCloseClick={() => setSelected(null)} pixelOffset={[0, -12]}>
              <RiderDetails rider={current} />
            </InfoWindow>
          ) : null}
        </MapFrame>

        <Card className="flex max-h-[520px] flex-col overflow-hidden">
          <CardHeader title="Riders" description={fleet.isLoading ? 'Loading…' : `${visible.length} shown`} />
          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 && !fleet.isLoading ? (
              <EmptyState icon={Radio} title="No riders" description="Riders appear here once they have a shift today." />
            ) : (
              <ul className="divide-y">
                {visible.map((r) => (
                  <li key={r.partnerId}>
                    <button type="button" onClick={() => setSelected(r.partnerId)}
                            className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60',
                              r.partnerId === selected && 'bg-primary/5')}>
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: AVAILABILITY[r.availability].color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.currentDelivery ? `${statusLabel(r.currentDelivery.status)} · ${r.currentDelivery.schoolName ?? ''}` : 'No open delivery'}
                        </span>
                      </span>
                      <Badge tone={AVAILABILITY[r.availability].tone}>{AVAILABILITY[r.availability].label}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {current && (current.lat === undefined || current.lng === undefined) ? (
            <div className="border-t p-4"><RiderDetails rider={current} /></div>
          ) : null}
        </Card>
      </div>

      <section className="mt-6" aria-labelledby="ongoing">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="ongoing" className="font-display text-[24px] font-semibold leading-tight">Assigned and ongoing deliveries</h2>
          <div className="w-56">
            <Field label="Status" htmlFor="live-status">
              <Select id="live-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
                <option value="">All ongoing</option>
                {ONGOING.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        {orders.error ? <Alert>{errorText(orders.error)}</Alert> : null}
        <DataTable columns={columns} data={rows} page={page} totalPages={orders.data?.totalPages ?? 0}
                   totalElements={status ? orders.data?.totalElements ?? 0 : rows.length} onPageChange={setPage}
                   loading={orders.isLoading} caption="Today's assigned and ongoing deliveries"
                   emptyTitle="Nothing on the road" emptyDescription="Deliveries appear here once they are assigned to a rider." />
      </section>
    </AppShell>
  );
}

function RiderDetails({ rider }: { rider: FleetPartner & { seenAt?: string } }) {
  const a = AVAILABILITY[rider.availability];
  const d = rider.currentDelivery;
  return (
    <div className="min-w-56 space-y-2 text-sm text-foreground">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{rider.name}</p>
        <Badge tone={a.tone} dot>{a.label}</Badge>
      </div>
      <p className="text-muted-foreground">{rider.vehicleType.replace('_', ' ').toLowerCase()} {rider.vehicleNumber ?? ''}</p>
      {rider.phone ? (
        <a href={`tel:${rider.phone}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
          <Phone className="h-3.5 w-3.5" aria-hidden />{phoneText(rider.phone)}
        </a>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Shift</dt>
        <dd>{rider.shiftStatus.toLowerCase()} · {istTime(rider.plannedStart)}–{istTime(rider.plannedEnd)}</dd>
        <dt className="text-muted-foreground">Last seen</dt>
        <dd>{rider.seenAt ? istTime(rider.seenAt) : 'No location yet'}</dd>
        <dt className="text-muted-foreground">Open orders</dt>
        <dd>{rider.openOrders}</dd>
        <dt className="text-muted-foreground">Now</dt>
        <dd>
          {d ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <StatusBadge status={d.status} />
              <span>{d.schoolName}</span>
              <span className="text-muted-foreground">due {istTime(d.deliveryDeadline)}</span>
              <Link className="text-primary hover:underline" href="/orders/">Orders</Link>
            </span>
          ) : 'No open delivery'}
        </dd>
      </dl>
    </div>
  );
}
