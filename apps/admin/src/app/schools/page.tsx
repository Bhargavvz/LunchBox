'use client';

import { type SchoolResponse } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { Holidays, SchoolForm } from '@/components/schools';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Dialog, DialogContent, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/useDebounced';

export default function SchoolsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 300);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SchoolResponse | 'new' | null>(null);
  const [holidaysFor, setHolidaysFor] = useState<SchoolResponse | null>(null);
  const schools = useQuery({ queryKey: ['schools', search, page], queryFn: () => api.admin.schools(search || undefined, page) });
  const writable = can('SUPER_ADMIN', 'OPS_ADMIN');
  const columns = useMemo<ColumnDef<SchoolResponse, unknown>[]>(() => [
    { header: 'Code', accessorKey: 'code' },
    { header: 'Name', cell: ({ row }) => (
      <Link href={`/schools/detail/?id=${row.original.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{row.original.name}</Link>
    ) },
    { header: 'City', accessorKey: 'city' },
    { header: 'Delivery window', cell: ({ row }) => `${row.original.deliveryWindowStart.slice(0, 5)}–${row.original.deliveryWindowEnd.slice(0, 5)}` },
    { header: 'Geofence', cell: ({ row }) => (row.original.geofence?.length ? 'Polygon' : `${row.original.geofenceRadiusM ?? 'default'} m`) },
    { header: 'Days', cell: ({ row }) => <span className="text-xs">{row.original.workingDays.map((d) => d.charAt(0) + d.slice(1, 3).toLowerCase()).join(' ')}</span> },
    { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.active ? 'ACTIVE' : 'INACTIVE'} /> },
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
      <div className="mb-4"><Field label="Search" htmlFor="q"><Input id="q" type="search" placeholder="Name or code" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></Field></div>
      {schools.error ? <Alert>{errorText(schools.error)}</Alert> : null}
      <DataTable caption="Schools" columns={columns} data={schools.data?.items ?? []} page={page}
                 totalPages={schools.data?.totalPages ?? 0} totalElements={schools.data?.totalElements ?? 0} onPageChange={setPage}
                 loading={schools.isLoading} emptyTitle={search ? 'No school matches' : 'No schools yet'} />
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
