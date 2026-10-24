'use client';

import { istDateTime } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const logs = useQuery({
    queryKey: ['audit', entityType, entityId, action, page],
    queryFn: () => api.admin.auditLogs({ entityType: entityType || undefined, entityId: entityId || undefined, action: action || undefined, page }),
  });
  return (
    <AppShell>
      <PageHeader eyebrow="Admin" title="Audit log" description="Append-only record of every significant change: who, what, when, before and after." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Entity type" htmlFor="au-type"><Input id="au-type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(0); }} placeholder="Order, School, Partner…" /></Field>
        <Field label="Entity id" htmlFor="au-id"><Input id="au-id" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(0); }} /></Field>
        <Field label="Action" htmlFor="au-action"><Input id="au-action" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} placeholder="order.cancelled" /></Field>
      </div>
      {logs.error ? <Alert>{errorText(logs.error)}</Alert> : null}
      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th /></tr></thead>
          <tbody>
            {logs.data?.items.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td>{istDateTime(l.occurredAt)}</td>
                  <td>{l.actorRole} {l.actorUserId?.slice(0, 8) ?? ''}</td>
                  <td className="font-mono text-xs">{l.action}</td>
                  <td>{l.entityType} <span className="font-mono text-xs">{l.entityId?.slice(0, 13)}</span></td>
                  <td>{l.ip ?? ''}</td>
                  <td><Button size="sm" variant="ghost" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Hide' : 'Diff'}</Button></td>
                </tr>
                {open === l.id ? (
                  <tr key={`${l.id}-d`} className="bg-muted/30">
                    <td colSpan={6}>
                      <div className="grid gap-2 md:grid-cols-2">
                        <pre className="overflow-auto rounded bg-card p-2 text-xs">{JSON.stringify(l.before, null, 2)}</pre>
                        <pre className="overflow-auto rounded bg-card p-2 text-xs">{JSON.stringify(l.after, null, 2)}</pre>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={!logs.data || page + 1 >= logs.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </AppShell>
  );
}
