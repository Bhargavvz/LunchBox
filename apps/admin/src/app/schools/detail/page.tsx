'use client';

import { todayIst } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, Clock, MapPin, Phone, School, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MapFrame, Pin } from '@/components/maps';
import { DAYS, Holidays, SchoolForm } from '@/components/schools';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, CardHeader, Dialog, DialogContent, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const hm = (t: string) => t.slice(0, 5);

function minus(t: string, minutes: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) - minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function SchoolDetail({ id }: { id: string }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const school = useQuery({ queryKey: ['admin-school', id], queryFn: () => api.admin.school(id) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.admin.settings });
  const children = useQuery({ queryKey: ['children', '', id, 0], queryFn: () => api.admin.children({ schoolId: id, size: 25 }) });
  const today = useQuery({ queryKey: ['admin-orders', todayIst(), '', id], queryFn: () => api.admin.orders({ date: todayIst(), schoolId: id, size: 1 }) });
  if (school.isLoading) return <Skeleton className="h-64 w-full" />;
  if (school.error || !school.data) return <Alert>{errorText(school.error ?? new Error('School not found'))}</Alert>;
  const s = school.data;
  const setting = (k: string) => Number(settings.data?.find((x) => x.key === k)?.value ?? NaN);
  const lead = setting('order.pickup_lead_minutes');
  const length = setting('order.pickup_window_minutes');
  const pickupStart = Number.isFinite(lead) ? minus(s.deliveryWindowStart, lead) : null;
  const pickupEnd = pickupStart && Number.isFinite(length) ? minus(pickupStart, -length) : null;
  const writable = can('SUPER_ADMIN', 'OPS_ADMIN');

  return (
    <>
      <PageHeader eyebrow={`School · ${s.code}`} title={s.name} description={`${s.addressLine}, ${s.city} ${s.pincode}`}
        actions={writable ? <Button onClick={() => setEditing(true)}>Edit school</Button> : null} />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} />
        <Link href="/schools/" className="text-sm text-primary underline-offset-2 hover:underline">All schools</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Clock} title="Daily timings" description="What parents see in the app." />
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Pickup from homes</dt><dd className="tabular font-medium">{pickupStart && pickupEnd ? `${pickupStart}–${pickupEnd}` : '…'}</dd>
            <dt className="text-muted-foreground">Delivery window</dt><dd className="tabular font-medium">{hm(s.deliveryWindowStart)}–{hm(s.deliveryWindowEnd)}</dd>
            <dt className="text-muted-foreground">Lunch</dt><dd className="tabular font-medium">{hm(s.lunchTime)}</dd>
            <dt className="text-muted-foreground">Gate geofence</dt><dd className="font-medium">{s.geofence?.length ? 'Drawn polygon' : `${s.geofenceRadiusM ?? 'Default'} m radius`}</dd>
          </dl>
          <p className="mt-3 text-sm font-medium">Working days</p>
          <div className="mt-1 flex gap-1">
            {DAYS.map((d) => (
              <span key={d} className={`flex-1 rounded-md py-1 text-center text-xs ${s.workingDays.includes(d) ? 'bg-primary/10 font-semibold text-primary' : 'border text-muted-foreground'}`}>
                {d.charAt(0) + d.slice(1, 3).toLowerCase()}
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader icon={Users} title="Children and today" description="Who this school serves." />
          <p className="font-display text-4xl font-bold">{children.data?.totalElements ?? '…'}</p>
          <p className="text-sm text-muted-foreground">children enrolled</p>
          <p className="mt-3 font-display text-4xl font-bold">{today.data?.totalElements ?? '…'}</p>
          <p className="text-sm text-muted-foreground">lunchboxes today · <Link href="/orders/" className="text-primary underline-offset-2 hover:underline">open orders</Link></p>
        </Card>
        <Card>
          <CardHeader icon={Phone} title="Contact and handover" description="Riders see only the handover instructions." />
          <p className="text-sm">{s.contactName ?? 'No contact name'}</p>
          <p className="text-sm text-muted-foreground">{s.contactPhone ?? 'No phone'}</p>
          <p className="mt-3 text-sm font-medium">Handover instructions</p>
          <p className="text-sm text-muted-foreground">{s.handoverInstructions ?? 'None yet.'}</p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={MapPin} title="School gate" description="Where riders hand over lunchboxes." />
          <MapFrame label="School gate" height={260} center={s.location} zoom={16}>
            <Pin position={s.location} label={s.name} />
          </MapFrame>
        </Card>
        <Card>
          <CardHeader icon={CalendarOff} title="Holidays" description="Declaring one cancels that day's pickups and tells parents." />
          <Holidays school={s} />
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader icon={School} title="Children at this school" description="First 25, newest first. Search all on the Children page." />
        {children.data && children.data.items.length === 0 ? <EmptyState title="No children yet" description="Children appear when parents add them in the app." /> : null}
        <ul className="divide-y text-sm">
          {children.data?.items.map((c) => (
            <li key={c.id} className="flex justify-between py-2"><span>{c.firstName} {c.lastName ?? ''}</span>
              <span className="text-muted-foreground">Class {c.className}{c.section ? `-${c.section}` : ''}</span></li>
          ))}
        </ul>
      </Card>
      {editing ? (
        <Dialog open onOpenChange={(o) => !o && setEditing(false)}>
          <DialogContent title={`Edit ${s.name}`}>
            <SchoolForm school={s} onDone={() => { setEditing(false); void school.refetch(); }} />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function Detail() {
  const id = useSearchParams().get('id');
  return id ? <SchoolDetail id={id} /> : <EmptyState title="No school chosen" description="Open a school from the Schools list." />;
}

export default function SchoolDetailPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Detail />
      </Suspense>
    </AppShell>
  );
}
