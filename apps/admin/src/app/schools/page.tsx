'use client';

import { istDate, type SchoolRequest, type SchoolResponse } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { MapFrame, PolygonEditor } from '@/components/maps';
import { Alert, Button, Dialog, DialogContent, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

function trimTime(t: string | undefined, fallback: string): string {
  return t ? t.slice(0, 5) : fallback;
}

function SchoolForm({ school, onDone }: { school: SchoolResponse | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: school?.code ?? '',
    name: school?.name ?? '',
    addressLine: school?.addressLine ?? '',
    city: school?.city ?? '',
    pincode: school?.pincode ?? '',
    lat: school?.location.lat ?? 12.9716,
    lng: school?.location.lng ?? 77.5946,
    geofenceRadiusM: school?.geofenceRadiusM ?? 150,
    lunchTime: trimTime(school?.lunchTime, '12:30'),
    deliveryWindowStart: trimTime(school?.deliveryWindowStart, '11:30'),
    deliveryWindowEnd: trimTime(school?.deliveryWindowEnd, '12:15'),
    contactName: school?.contactName ?? '',
    contactPhone: school?.contactPhone ?? '',
    handoverInstructions: school?.handoverInstructions ?? '',
    active: school?.active ?? true,
  });
  const [days, setDays] = useState<string[]>(school?.workingDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  const [fence, setFence] = useState(school?.geofence ?? []);
  const save = useMutation({
    mutationFn: () => {
      const body: SchoolRequest = {
        ...f,
        location: { lat: Number(f.lat), lng: Number(f.lng) },
        geofence: fence.length >= 3 ? fence : undefined,
        geofenceRadiusM: Number(f.geofenceRadiusM),
        workingDays: days as SchoolRequest['workingDays'],
        contactName: f.contactName || undefined,
        contactPhone: f.contactPhone || undefined,
        handoverInstructions: f.handoverInstructions || undefined,
      } as SchoolRequest;
      return school ? api.admin.updateSchool(school.id, body) : api.admin.createSchool(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schools'] });
      onDone();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
      {save.error ? <Alert>{errorText(save.error)}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Code" htmlFor="s-code"><Input id="s-code" required disabled={!!school} value={f.code} onChange={set('code')} placeholder="DPS-BLR-01" /></Field>
        <Field label="Name" htmlFor="s-name"><Input id="s-name" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Address" htmlFor="s-addr"><Input id="s-addr" required value={f.addressLine} onChange={set('addressLine')} /></Field>
        <Field label="City" htmlFor="s-city"><Input id="s-city" required value={f.city} onChange={set('city')} /></Field>
        <Field label="PIN code" htmlFor="s-pin"><Input id="s-pin" required value={f.pincode} onChange={set('pincode')} /></Field>
        <Field label="Geofence radius (m) if no polygon" htmlFor="s-radius"><Input id="s-radius" type="number" value={f.geofenceRadiusM} onChange={set('geofenceRadiusM')} /></Field>
        <Field label="Latitude" htmlFor="s-lat"><Input id="s-lat" type="number" step="0.000001" value={f.lat} onChange={set('lat')} /></Field>
        <Field label="Longitude" htmlFor="s-lng"><Input id="s-lng" type="number" step="0.000001" value={f.lng} onChange={set('lng')} /></Field>
        <Field label="Delivery window opens (IST)" htmlFor="s-ws"><Input id="s-ws" type="time" value={f.deliveryWindowStart} onChange={set('deliveryWindowStart')} /></Field>
        <Field label="Delivery window closes (IST)" htmlFor="s-we"><Input id="s-we" type="time" value={f.deliveryWindowEnd} onChange={set('deliveryWindowEnd')} /></Field>
        <Field label="Lunch time (IST)" htmlFor="s-lunch"><Input id="s-lunch" type="time" value={f.lunchTime} onChange={set('lunchTime')} /></Field>
        <Field label="Contact phone (+91…)" htmlFor="s-phone"><Input id="s-phone" value={f.contactPhone} onChange={set('contactPhone')} /></Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Working days</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />
              {d.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Handover instructions for partners" htmlFor="s-hand"><Input id="s-hand" value={f.handoverInstructions} onChange={set('handoverInstructions')} /></Field>
      <div>
        <p className="mb-1 text-sm font-medium">Geofence polygon (click map to add points; optional)</p>
        <MapFrame label="School geofence editor" height={260} center={{ lat: Number(f.lat), lng: Number(f.lng) }} zoom={16}>
          <PolygonEditor value={fence} onChange={setFence} />
        </MapFrame>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFence([])}>Clear polygon</Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
      </label>
      <Button type="submit" disabled={save.isPending}>Save school</Button>
    </form>
  );
}

function Holidays({ school }: { school: SchoolResponse }) {
  const qc = useQueryClient();
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const list = useQuery({ queryKey: ['holidays', school.id], queryFn: () => api.schools.holidays(school.id, from, to) });
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const add = useMutation({
    mutationFn: () => api.admin.addHoliday(school.id, { date, reason }),
    onSuccess: () => { setDate(''); setReason(''); void qc.invalidateQueries({ queryKey: ['holidays', school.id] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.admin.removeHoliday(school.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays', school.id] }),
  });
  return (
    <div className="space-y-3">
      <Alert tone="info">Adding a holiday cancels any pickups already scheduled for that day and notifies parents.</Alert>
      {add.error ? <Alert>{errorText(add.error)}</Alert> : null}
      <ul className="text-sm">
        {list.data?.map((h) => (
          <li key={h.id} className="flex justify-between border-t py-1">
            <span>{istDate(h.date)} — {h.reason}</span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(h.id)}>Remove</Button>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <Field label="Date" htmlFor="h-date"><Input id="h-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Reason" htmlFor="h-reason"><Input id="h-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Button disabled={!date || !reason || add.isPending} onClick={() => add.mutate()}>Add</Button>
      </div>
    </div>
  );
}

export default function SchoolsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SchoolResponse | 'new' | null>(null);
  const [holidaysFor, setHolidaysFor] = useState<SchoolResponse | null>(null);
  const schools = useQuery({ queryKey: ['schools', q, page], queryFn: () => api.admin.schools(q || undefined, page) });
  const writable = can('SUPER_ADMIN', 'OPS_ADMIN');
  const columns = useMemo<ColumnDef<SchoolResponse, unknown>[]>(() => [
    { header: 'Code', accessorKey: 'code' },
    { header: 'Name', accessorKey: 'name' },
    { header: 'City', accessorKey: 'city' },
    { header: 'Delivery window', cell: ({ row }) => `${row.original.deliveryWindowStart.slice(0, 5)}–${row.original.deliveryWindowEnd.slice(0, 5)}` },
    { header: 'Geofence', cell: ({ row }) => (row.original.geofence?.length ? 'Polygon' : `${row.original.geofenceRadiusM ?? 'default'} m`) },
    { header: 'Active', cell: ({ row }) => (row.original.active ? 'Yes' : 'No') },
    { header: '', id: 'actions', cell: ({ row }) => writable ? (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setEditing(row.original)}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => setHolidaysFor(row.original)}>Holidays</Button>
      </div>
    ) : null },
  ], [writable]);

  return (
    <AppShell>
      <PageHeader eyebrow="People" title="Schools" actions={writable ? <Button onClick={() => setEditing('new')}>Add school</Button> : null} />
      <div className="mb-4"><Field label="Search" htmlFor="q"><Input id="q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></Field></div>
      {schools.error ? <Alert>{errorText(schools.error)}</Alert> : null}
      <DataTable caption="Schools" columns={columns} data={schools.data?.items ?? []} page={page}
                 totalPages={schools.data?.totalPages ?? 0} totalElements={schools.data?.totalElements ?? 0} onPageChange={setPage} />
      {editing ? (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent title={editing === 'new' ? 'Add school' : `Edit ${editing.name}`}>
            <SchoolForm school={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        </Dialog>
      ) : null}
      {holidaysFor ? (
        <Dialog open onOpenChange={(o) => !o && setHolidaysFor(null)}>
          <DialogContent title={`Holidays · ${holidaysFor.name}`}><Holidays school={holidaysFor} /></DialogContent>
        </Dialog>
      ) : null}
    </AppShell>
  );
}
