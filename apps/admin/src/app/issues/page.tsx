'use client';

import { istDateTime } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function IssuesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [openOnly, setOpenOnly] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const issues = useQuery({ queryKey: ['issues', openOnly], queryFn: () => api.admin.issues(openOnly), refetchInterval: 15_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['issues'] });
  const ack = useMutation({ mutationFn: api.admin.acknowledgeIssue, onSuccess: refresh });
  const resolve = useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => api.admin.resolveIssue(id, note), onSuccess: refresh });

  return (
    <AppShell>
      <PageHeader title="Issues & SOS" actions={
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>
      } />
      {issues.error ?? ack.error ?? resolve.error ? <Alert>{errorText(issues.error ?? ack.error ?? resolve.error)}</Alert> : null}
      <div className="space-y-3">
        {issues.data?.items.map((i) => (
          <Card key={i.id} className={i.type === 'SOS' && i.status !== 'RESOLVED' ? 'border-destructive' : ''}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={i.type} /> <StatusBadge status={i.status} />
              <span className="font-medium">{i.partnerName}</span>
              <span className="text-sm text-muted-foreground">{istDateTime(i.createdAt)}</span>
              {i.location ? (
                <a className="text-sm text-primary underline" target="_blank" rel="noreferrer"
                   href={`https://www.google.com/maps?q=${i.location.lat},${i.location.lng}`}>Location</a>
              ) : null}
            </div>
            {i.description ? <p className="mt-2 text-sm">{i.description}</p> : null}
            {i.resolutionNote ? <p className="mt-2 text-sm text-muted-foreground">Resolution: {i.resolutionNote}</p> : null}
            {can('SUPER_ADMIN', 'OPS_ADMIN') && i.status !== 'RESOLVED' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {i.status === 'OPEN' ? <Button size="sm" variant="outline" onClick={() => ack.mutate(i.id)}>Acknowledge</Button> : null}
                <Input className="max-w-sm" placeholder="Resolution note" aria-label="Resolution note" value={notes[i.id] ?? ''}
                       onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
                <Button size="sm" disabled={(notes[i.id] ?? '').length < 3} onClick={() => resolve.mutate({ id: i.id, note: notes[i.id]! })}>Resolve</Button>
              </div>
            ) : null}
          </Card>
        ))}
        {issues.data?.items.length === 0 ? <p className="text-muted-foreground">No issues.</p> : null}
      </div>
    </AppShell>
  );
}
