'use client';

import { addDays, istDateTime, todayIst, type AuditEntry } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, ScrollText } from 'lucide-react';
import { Fragment, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useDebounced } from '@/lib/useDebounced';
import { downloadBlob } from '@/lib/utils';

const MODULES = ['', 'allocation', 'order', 'subscription', 'payment', 'rider', 'school', 'child', 'parent', 'user', 'plan',
  'setting', 'route', 'leave', 'address', 'service_area', 'staff', 'broadcast', 'payout', 'account', 'demo'];
const SEVERITY_TONE = { INFO: 'default', WARNING: 'warning', ERROR: 'danger' } as const;

/** Before/after side by side, changed fields first, so a change can be read at a glance. */
function Changes({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (keys.length === 0) return <p className="text-sm text-muted-foreground">No details recorded.</p>;
  const changed = keys.filter((k) => show(b[k]) !== show(a[k]));
  const same = keys.filter((k) => show(b[k]) === show(a[k]));
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Field</th><th className="py-1 pr-3">Before</th><th className="py-1">After</th></tr></thead>
      <tbody>
        {[...changed, ...same].map((k) => (
          <tr key={k} className={changed.includes(k) ? '' : 'text-muted-foreground'}>
            <td className="py-1 pr-3 align-top font-medium">{k}</td>
            <td className="max-w-[28ch] break-words py-1 pr-3 align-top font-mono">{show(b[k])}</td>
            <td className={`max-w-[28ch] break-words py-1 align-top font-mono ${changed.includes(k) ? 'text-primary' : ''}`}>{show(a[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Chrome on Windows" from a user agent, for the "from where" column. */
function device(ua: string | null | undefined): string {
  if (!ua) return '—';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /okhttp|Dart|ReactNative|Expo/i.test(ua) ? 'App' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Client';
  return os ? `${app} on ${os}` : app;
}

/**
 * Everything that happened, in plain words: who (name, role), what, when, from where (IP, device), before and after,
 * plus system events such as allocation results and failures. Filter, search and export.
 */
export default function LogsPage() {
  const [severity, setSeverity] = useState('');
  const [module, setModule] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(addDays(todayIst(), -7));
  const [to, setTo] = useState(todayIst());
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const search = useDebounced(q.trim(), 350);
  const range = {
    from: new Date(`${from}T00:00:00+05:30`).toISOString(),
    to: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString(),
  };
  const filters = { severity: severity || undefined, module: module || undefined, q: search || undefined, ...range };
  const logs = useQuery({
    queryKey: ['audit', filters, page],
    queryFn: () => api.admin.auditLogs({ ...filters, page, size: 50 }),
  });
  const reset = () => setPage(0);

  async function exportCsv() {
    const blob = await api.admin.downloadCsv('/api/v1/admin/audit-logs.csv', filters);
    downloadBlob(blob, `lunchbox-log-${from}-to-${to}.csv`);
  }

  const items: AuditEntry[] = logs.data?.items ?? [];
  return (
    <AppShell>
      <PageHeader eyebrow="Admin" title="Logs"
        description="Who did what, when and from where, with before and after, plus system events like allocation results and failures. Entries cannot be edited or deleted."
        actions={<Button variant="outline" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <Field label="Search" htmlFor="lg-q"><Input id="lg-q" type="search" value={q} placeholder="Words, action or ID" onChange={(e) => { setQ(e.target.value); reset(); }} /></Field>
        <Field label="Severity" htmlFor="lg-sev">
          <Select id="lg-sev" value={severity} onChange={(e) => { setSeverity(e.target.value); reset(); }}>
            <option value="">All</option><option value="INFO">Info</option><option value="WARNING">Warning</option><option value="ERROR">Error</option>
          </Select>
        </Field>
        <Field label="Area" htmlFor="lg-mod">
          <Select id="lg-mod" value={module} onChange={(e) => { setModule(e.target.value); reset(); }}>
            {MODULES.map((m) => <option key={m} value={m}>{m ? m.replace('_', ' ') : 'All areas'}</option>)}
          </Select>
        </Field>
        <Field label="From" htmlFor="lg-from"><Input id="lg-from" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); reset(); }} /></Field>
        <Field label="To" htmlFor="lg-to"><Input id="lg-to" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); reset(); }} /></Field>
      </div>
      {logs.error ? <Alert>{errorText(logs.error)}</Alert> : null}
      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead><tr><th>When</th><th>Severity</th><th>What happened</th><th>Who</th><th>From where</th><th /></tr></thead>
          <tbody>
            {logs.isLoading ? Array.from({ length: 6 }, (_, i) => (
              <tr key={i}><td colSpan={6}><Skeleton className="h-4 w-full" /></td></tr>
            )) : null}
            {!logs.isLoading && items.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={ScrollText} title="Nothing logged for these filters" description="Widen the dates or clear the search." /></td></tr>
            ) : null}
            {items.map((e) => (
              <Fragment key={e.id}>
                <tr>
                  <td className="tabular whitespace-nowrap">{istDateTime(e.occurredAt)}</td>
                  <td><Badge tone={SEVERITY_TONE[e.severity as keyof typeof SEVERITY_TONE] ?? 'default'} dot>{e.severity.charAt(0) + e.severity.slice(1).toLowerCase()}</Badge></td>
                  <td>
                    <p>{e.summary ?? e.action}</p>
                    <p className="text-xs text-muted-foreground"><code>{e.action}</code>{e.entityId ? <> · {e.entityType} <code>{e.entityId.slice(-8)}</code></> : null}</p>
                  </td>
                  <td>{e.actorName ?? 'Unknown'}<p className="text-xs text-muted-foreground">{e.actorRole ? e.actorRole.replace('_', ' ').toLowerCase() : ''}</p></td>
                  <td className="text-xs">{e.ip ?? '—'}<p className="text-muted-foreground">{device(e.userAgent)}</p></td>
                  <td><Button size="sm" variant="ghost" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide' : 'Details'}</Button></td>
                </tr>
                {open === e.id ? (
                  <tr>
                    <td colSpan={6} className="bg-muted/40">
                      <Changes before={e.before} after={e.after} />
                      <p className="mt-2 text-xs text-muted-foreground">Request {e.requestId ?? '—'}</p>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{logs.data ? `${logs.data.totalElements} entries` : ''}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="tabular self-center">Page {page + 1} of {Math.max(1, logs.data?.totalPages ?? 1)}</span>
          <Button size="sm" variant="outline" disabled={!logs.data || page + 1 >= logs.data.totalPages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </AppShell>
  );
}
