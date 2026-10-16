'use client';

import type { AdminPartner } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Dialog, DialogContent, DialogTrigger, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const VEHICLES = ['BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'EV_SCOOTER', 'CAR'] as const;

function CreatePartner() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ phone: '', firstName: '', lastName: '', vehicleType: 'SCOOTER' as (typeof VEHICLES)[number],
    vehicleNumber: '', capacity: 8, lat: 12.9716, lng: 77.5946, serviceRadiusM: 5000 });
  const create = useMutation({
    mutationFn: () => api.admin.createPartner({
      phone: `+91${f.phone.replace(/\D/g, '').slice(-10)}`,
      profile: { firstName: f.firstName, lastName: f.lastName || undefined, vehicleType: f.vehicleType,
        vehicleNumber: f.vehicleNumber.toUpperCase().replace(/\s/g, '') || undefined, capacity: f.capacity,
        homeZone: { lat: f.lat, lng: f.lng }, serviceRadiusM: f.serviceRadiusM },
    }),
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['partners'] }); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: typeof f[k] === 'number' ? Number(e.target.value) : e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Add partner</Button></DialogTrigger>
      <DialogContent title="Onboard delivery partner" description="The partner can sign in once KYC is approved.">
        <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
          {create.error ? <Alert>{errorText(create.error)}</Alert> : null}
          <Field label="Mobile (10 digits)" htmlFor="p-phone"><Input id="p-phone" required value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="p-first"><Input id="p-first" required value={f.firstName} onChange={set('firstName')} /></Field>
            <Field label="Last name" htmlFor="p-last"><Input id="p-last" value={f.lastName} onChange={set('lastName')} /></Field>
            <Field label="Vehicle" htmlFor="p-vehicle">
              <Select id="p-vehicle" value={f.vehicleType} onChange={set('vehicleType')}>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</Select>
            </Field>
            <Field label="Vehicle number" htmlFor="p-vno"><Input id="p-vno" value={f.vehicleNumber} onChange={set('vehicleNumber')} placeholder="KA01AB1234" /></Field>
            <Field label="Capacity (lunchboxes)" htmlFor="p-cap"><Input id="p-cap" type="number" min={1} max={40} value={f.capacity} onChange={set('capacity')} /></Field>
            <Field label="Service radius (m)" htmlFor="p-radius"><Input id="p-radius" type="number" min={500} max={30000} value={f.serviceRadiusM} onChange={set('serviceRadiusM')} /></Field>
            <Field label="Home zone latitude" htmlFor="p-lat"><Input id="p-lat" type="number" step="0.000001" value={f.lat} onChange={set('lat')} /></Field>
            <Field label="Home zone longitude" htmlFor="p-lng"><Input id="p-lng" type="number" step="0.000001" value={f.lng} onChange={set('lng')} /></Field>
          </div>
          <Button type="submit" disabled={create.isPending}>Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PartnersPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [kyc, setKyc] = useState('');
  const [page, setPage] = useState(0);
  const partners = useQuery({
    queryKey: ['partners', q, kyc, page],
    queryFn: () => api.admin.partners({ q: q || undefined, kycStatus: kyc || undefined, page, size: 25 }),
  });
  const columns = useMemo<ColumnDef<AdminPartner, unknown>[]>(() => [
    { header: 'Name', cell: ({ row }) => <Link className="font-medium text-primary hover:underline" href={`/partners/detail/?id=${row.original.id}`}>{row.original.firstName} {row.original.lastName ?? ''}</Link> },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Vehicle', cell: ({ row }) => `${row.original.vehicleType} ${row.original.vehicleNumber ?? ''}` },
    { header: 'Capacity', accessorKey: 'capacity' },
    { header: 'KYC', cell: ({ row }) => <StatusBadge status={row.original.kycStatus} /> },
    { header: 'Rating', cell: ({ row }) => row.original.rating ?? '—' },
    { header: 'Active', cell: ({ row }) => (row.original.active ? 'Yes' : 'No') },
  ], []);
  return (
    <AppShell>
      <PageHeader title="Delivery partners" actions={can('SUPER_ADMIN', 'OPS_ADMIN') ? <CreatePartner /> : null} />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Search" htmlFor="q"><Input id="q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Name or vehicle" /></Field>
        <Field label="KYC" htmlFor="kyc">
          <Select id="kyc" value={kyc} onChange={(e) => { setKyc(e.target.value); setPage(0); }}>
            {['', 'NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </Select>
        </Field>
      </div>
      {partners.error ? <Alert>{errorText(partners.error)}</Alert> : null}
      <DataTable caption="Partners" columns={columns} data={partners.data?.items ?? []} page={page}
                 totalPages={partners.data?.totalPages ?? 0} totalElements={partners.data?.totalElements ?? 0}
                 onPageChange={setPage} loading={partners.isLoading} />
    </AppShell>
  );
}
