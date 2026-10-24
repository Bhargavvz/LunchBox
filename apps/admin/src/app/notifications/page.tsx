'use client';

import { istDateTime } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

export default function BroadcastPage() {
  const qc = useQueryClient();
  const [audience, setAudience] = useState<'ALL_PARENTS' | 'ALL_PARTNERS' | 'SCHOOL_PARENTS'>('ALL_PARENTS');
  const [schoolId, setSchoolId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const schools = useQuery({ queryKey: ['schools-all'], queryFn: () => api.admin.schools(undefined, 0, 200) });
  const recent = useQuery({ queryKey: ['broadcasts'], queryFn: api.admin.broadcasts, refetchInterval: 10_000 });
  const send = useMutation({
    mutationFn: () => api.admin.broadcast({ audience, schoolId: audience === 'SCHOOL_PARENTS' ? schoolId : undefined, title, body }),
    onSuccess: () => { setTitle(''); setBody(''); void qc.invalidateQueries({ queryKey: ['broadcasts'] }); },
  });
  return (
    <AppShell roles={['SUPER_ADMIN', 'OPS_ADMIN']}>
      <PageHeader eyebrow="Insights" title="Broadcast notifications" description="Sent as push notifications and stored in each user's notification centre." />
      <Card className="max-w-2xl">
        <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); send.mutate(); }}>
          {send.error ? <Alert>{errorText(send.error)}</Alert> : null}
          {send.isSuccess ? <Alert tone="success">Queued for delivery.</Alert> : null}
          <Field label="Audience" htmlFor="b-aud">
            <Select id="b-aud" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
              <option value="ALL_PARENTS">All parents</option>
              <option value="ALL_PARTNERS">All partners</option>
              <option value="SCHOOL_PARENTS">Parents at one school</option>
            </Select>
          </Field>
          {audience === 'SCHOOL_PARENTS' ? (
            <Field label="School" htmlFor="b-school">
              <Select id="b-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
                <option value="">Choose…</option>
                {schools.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Title" htmlFor="b-title"><Input id="b-title" maxLength={160} required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Message" htmlFor="b-body"><Textarea id="b-body" maxLength={1000} required value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Button type="submit" disabled={send.isPending}>Send broadcast</Button>
        </form>
      </Card>
      <h2 className="mb-2 mt-8 font-semibold">Recent</h2>
      <ul className="space-y-2">
        {recent.data?.map((b) => (
          <li key={b.id} className="rounded border bg-card p-3 text-sm">
            <div className="flex items-center gap-2"><StatusBadge status={b.status} /> <span className="font-medium">{b.title}</span></div>
            <p>{b.body}</p>
            <p className="text-xs text-muted-foreground">{b.audience} · {b.recipientCount} recipients · {istDateTime(b.createdAt)}</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
