'use client';

import { istDate, type Schemas } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Dialog, DialogContent, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/useDebounced';

type ParentRow = Schemas['AdminParentResponse'];
type ChildRow = Schemas['AdminChildResponse'];

/** Parents and children (one screen, two tabs); `/children/` opens on the children tab. */
export function PeoplePage({ initialTab = 'parents' }: { initialTab?: 'parents' | 'children' }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'parents' | 'children'>(initialTab);
  const [q, setQ] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const search = useDebounced(q.trim(), 300);
  const schools = useQuery({ queryKey: ['schools-all'], queryFn: () => api.admin.schools(undefined, 0, 200) });
  const [page, setPage] = useState(0);
  const parents = useQuery({ queryKey: ['parents', search, page], queryFn: () => api.admin.parents(search || undefined, page), enabled: tab === 'parents' });
  const children = useQuery({ queryKey: ['children', search, schoolId, page], queryFn: () => api.admin.children({ q: search || undefined, schoolId: schoolId || undefined, page, size: 25 }), enabled: tab === 'children' });
  const [erasing, setErasing] = useState<ParentRow | null>(null);
  const erase = useMutation({
    mutationFn: (userId: string) => api.admin.eraseUser(userId),
    onSuccess: () => { setErasing(null); void qc.invalidateQueries({ queryKey: ['parents'] }); },
  });
  const status = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'SUSPEND' | 'REACTIVATE' }) => api.admin.setUserStatus(userId, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parents'] }),
  });

  const parentCols = useMemo<ColumnDef<ParentRow, unknown>[]>(() => [
    { header: 'Name', cell: ({ row }) => `${row.original.firstName} ${row.original.lastName ?? ''}` },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: 'Joined', cell: ({ row }) => istDate(row.original.createdAt) },
    { header: '', id: 'act', cell: ({ row }) => can('SUPER_ADMIN', 'OPS_ADMIN') && row.original.status !== 'DELETED' ? (
      <div className="flex gap-1">
        {row.original.status === 'SUSPENDED'
          ? <Button size="sm" variant="outline" onClick={() => status.mutate({ userId: row.original.userId, action: 'REACTIVATE' })}>Reactivate</Button>
          : <Button size="sm" variant="ghost" onClick={() => status.mutate({ userId: row.original.userId, action: 'SUSPEND' })}>Suspend</Button>}
        {can('SUPER_ADMIN') ? <Button size="sm" variant="ghost" onClick={() => setErasing(row.original)}>Delete account</Button> : null}
      </div>
    ) : null },
  ], [can, status]);

  const childCols = useMemo<ColumnDef<ChildRow, unknown>[]>(() => [
    { header: 'Child', cell: ({ row }) => `${row.original.firstName} ${row.original.lastName ?? ''}` },
    { header: 'School', accessorKey: 'schoolName' },
    { header: 'Class', cell: ({ row }) => `${row.original.className}${row.original.section ? `-${row.original.section}` : ''}` },
    { header: 'Roll no.', accessorKey: 'rollNumber' },
    { header: 'Added', cell: ({ row }) => istDate(row.original.createdAt) },
  ], []);

  const err = parents.error ?? children.error ?? status.error ?? erase.error;
  return (
    <AppShell>
      <PageHeader eyebrow="People" title="Parents & children" description="Personal data: access is audited." />
      <div role="tablist" className="mb-4 flex gap-2">
        {(['parents', 'children'] as const).map((t) => (
          <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'secondary' : 'ghost'} onClick={() => { setTab(t); setPage(0); }}>
            {t === 'parents' ? 'Parents' : 'Children'}
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <Field label="Search" htmlFor="q">
          <Input id="q" type="search" value={q} placeholder={tab === 'parents' ? 'Name or phone' : 'Child name'}
                 onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </Field>
        {tab === 'children' ? (
          <Field label="School" htmlFor="school">
            <Select id="school" className="w-64" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setPage(0); }}>
              <option value="">All schools</option>
              {schools.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      {err ? <Alert>{errorText(err)}</Alert> : null}
      {tab === 'parents' ? (
        <DataTable caption="Parents" columns={parentCols} emptyTitle={search ? 'No parent matches' : 'No parents yet'} data={parents.data?.items ?? []} page={page}
                   totalPages={parents.data?.totalPages ?? 0} totalElements={parents.data?.totalElements ?? 0} onPageChange={setPage} loading={parents.isLoading} />
      ) : (
        <DataTable caption="Children" columns={childCols} emptyTitle={search || schoolId ? 'No child matches' : 'No children yet'} data={children.data?.items ?? []} page={page}
                   totalPages={children.data?.totalPages ?? 0} totalElements={children.data?.totalElements ?? 0} onPageChange={setPage} loading={children.isLoading} />
      )}
      {erasing ? (
        <Dialog open onOpenChange={(o) => !o && setErasing(null)}>
          <DialogContent title={`Delete ${erasing.firstName}'s account?`}
                         description="Only on the parent's own request. Deletes their profile, children, addresses and sign-in; payment records are kept as the law requires. This cannot be undone.">
            <div className="flex gap-2">
              <Button variant="destructive" disabled={erase.isPending} onClick={() => erase.mutate(erasing.userId)}>Delete account</Button>
              <Button variant="ghost" onClick={() => setErasing(null)}>Keep account</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </AppShell>
  );
}
