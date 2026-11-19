'use client';

import { SERVICE_CITY, SERVICE_CITY_CENTER, istDate, type SchoolRequest, type SchoolResponse } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { MapFrame, PolygonEditor, PinPicker } from '@/components/maps';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

/** All seven days: schools may work on Saturday and, rarely, on Sunday. */
export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

function trimTime(t: string | undefined, fallback: string): string {
  return t ? t.slice(0, 5) : fallback;
}

export function SchoolForm({ school, onDone }: { school: SchoolResponse | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: school?.code ?? '',
    name: school?.name ?? '',
    addressLine: school?.addressLine ?? '',
    city: school?.city ?? SERVICE_CITY,
    pincode: school?.pincode ?? '',
    lat: school?.location.lat ?? SERVICE_CITY_CENTER.lat,
    lng: school?.location.lng ?? SERVICE_CITY_CENTER.lng,
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
        <Field label="Code" htmlFor="s-code"><Input id="s-code" required disabled={!!school} value={f.code} onChange={set('code')} placeholder="DPS-HYD-01" /></Field>
        <Field label="Name" htmlFor="s-name"><Input id="s-name" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Address" htmlFor="s-addr"><Input id="s-addr" required value={f.addressLine} onChange={set('addressLine')} /></Field>
        <Field label="City" htmlFor="s-city"><Input id="s-city" required value={f.city} onChange={set('city')} /></Field>
        <Field label="PIN code" htmlFor="s-pin"><Input id="s-pin" required value={f.pincode} onChange={set('pincode')} /></Field>
        <Field label="Geofence radius (m) if no polygon" htmlFor="s-radius"><Input id="s-radius" type="number" value={f.geofenceRadiusM} onChange={set('geofenceRadiusM')} /></Field>
        <Field label="Delivery window opens (IST)" htmlFor="s-ws"><Input id="s-ws" type="time" value={f.deliveryWindowStart} onChange={set('deliveryWindowStart')} /></Field>
        <Field label="Delivery window closes (IST)" htmlFor="s-we"><Input id="s-we" type="time" value={f.deliveryWindowEnd} onChange={set('deliveryWindowEnd')} /></Field>
        <Field label="Lunch time (IST)" htmlFor="s-lunch"><Input id="s-lunch" type="time" value={f.lunchTime} onChange={set('lunchTime')} /></Field>
        <Field label="Contact phone (+91…)" htmlFor="s-phone"><Input id="s-phone" value={f.contactPhone} onChange={set('contactPhone')} /></Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Working days</legend>
        <p className="mb-1 text-xs text-muted-foreground">Removing a day cancels pickups already created for it. Parents can add a new day to their plan in the app.</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" checked={days.includes(d)}
                     onChange={(e) => setDays(e.target.checked ? DAYS.filter((x) => x === d || days.includes(x)) : days.filter((x) => x !== d))} />
              {d.charAt(0) + d.slice(1, 3).toLowerCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="mb-1 text-sm font-medium">School gate (where riders hand over)</p>
        <PinPicker label="School gate location" height={260} value={{ lat: Number(f.lat), lng: Number(f.lng) }}
                   onChange={(p) => setF((cur) => ({ ...cur, lat: p.lat, lng: p.lng }))} />
      </div>
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
      <Button type="submit" disabled={save.isPending || days.length === 0}>Save school</Button>
    </form>
  );
}

export function Holidays({ school }: { school: SchoolResponse }) {
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

