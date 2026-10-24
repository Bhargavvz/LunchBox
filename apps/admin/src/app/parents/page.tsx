'use client';

import { istDate, type Schemas } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type ParentRow = Schemas['AdminParentResponse'];
type ChildRow = Schemas['AdminChildResponse'];

export default function ParentsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'parents' | 'children'>('parents');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const parents = useQuery({ queryKey: ['parents', q, page], queryFn: () => api.admin.parents(q || undefined, page), enabled: tab === 'parents' });
  const children = useQuery({ queryKey: ['children', q, page], queryFn: () => api.admin.children({ q: q || undefined, page, size: 25 }), enabled: tab === 'children' });
  const status = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'SUSPEND' | 'REACTIVATE' }) => api.admin.setUserStatus(userId, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parents'] }),
  });

  const parentCols = useMemo<ColumnDef<ParentRow, unknown>[]>(() => [
    { header: 'Name', cell: ({ row }) => `${row.original.firstName} ${row.original.lastName ?? ''}` },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: 'Joined', cell: ({ row }) => istDate(row.original.createdAt) },
    { header: '', id: 'act', cell: ({ row }) => can('SUPER_ADMIN', 'OPS_ADMIN') ? (
      row.original.status === 'SUSPENDED'
        ? <Button size="sm" variant="outline" onClick={() => status.mutate({ userId: row.original.userId, action: 'REACTIVATE' })}>Reactivate</Button>
        : <Button size="sm" variant="ghost" onClick={() => status.mutate({ userId: row.original.userId, action: 'SUSPEND' })}>Suspend</Button>
    ) : null },
  ], [can, status]);

  const childCols = useMemo<ColumnDef<ChildRow, unknown>[]>(() => [
    { header: 'Child', cell: ({ row }) => `${row.original.firstName} ${row.original.lastName ?? ''}` },
    { header: 'School', accessorKey: 'schoolName' },
    { header: 'Class', cell: ({ row }) => `${row.original.className}${row.original.section ? `-${row.original.section}` : ''}` },
    { header: 'Roll no.', accessorKey: 'rollNumber' },
    { header: 'Added', cell: ({ row }) => istDate(row.original.createdAt) },
  ], []);

  const err = parents.error ?? children.error ?? status.error;
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
      <div className="mb-4"><Field label="Search" htmlFor="q"><Input id="q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></Field></div>
      {err ? <Alert>{errorText(err)}</Alert> : null}
      {tab === 'parents' ? (
        <DataTable caption="Parents" columns={parentCols} data={parents.data?.items ?? []} page={page}
                   totalPages={parents.data?.totalPages ?? 0} totalElements={parents.data?.totalElements ?? 0} onPageChange={setPage} loading={parents.isLoading} />
      ) : (
        <DataTable caption="Children" columns={childCols} data={children.data?.items ?? []} page={page}
                   totalPages={children.data?.totalPages ?? 0} totalElements={children.data?.totalElements ?? 0} onPageChange={setPage} loading={children.isLoading} />
      )}
    </AppShell>
  );
}
