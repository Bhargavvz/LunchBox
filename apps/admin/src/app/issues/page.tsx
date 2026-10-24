'use client';

import { istDateTime } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, MapPin, MessageSquareWarning, Siren } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge, statusLabel } from '@/components/StatusBadge';
import { Alert, Avatar, Button, Card, EmptyState, Input, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export default function IssuesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [openOnly, setOpenOnly] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const issues = useQuery({ queryKey: ['issues', openOnly], queryFn: () => api.admin.issues(openOnly), refetchInterval: 15_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['issues'] });
  const ack = useMutation({ mutationFn: api.admin.acknowledgeIssue, onSuccess: refresh });
  const resolve = useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => api.admin.resolveIssue(id, note), onSuccess: refresh });
  const err = issues.error ?? ack.error ?? resolve.error;

  // SOS first, then oldest first: the longest-waiting emergency is always at the top.
  const items = [...(issues.data?.items ?? [])].sort((a, b) => {
    const sa = a.type === 'SOS' && a.status !== 'RESOLVED' ? 0 : 1;
    const sb = b.type === 'SOS' && b.status !== 'RESOLVED' ? 0 : 1;
    return sa - sb || a.createdAt.localeCompare(b.createdAt);
  });

  return (
    <AppShell>
      <PageHeader eyebrow="Operations" title="Issues & SOS" description="Raised by partners from the field. SOS alerts go to the top and stay there until resolved."
        actions={
          <div role="radiogroup" aria-label="Show" className="flex rounded-lg border bg-card p-1 shadow-warm">
            {[{ v: true, l: 'Open' }, { v: false, l: 'All' }].map((o) => (
              <button key={o.l} type="button" role="radio" aria-checked={openOnly === o.v} onClick={() => setOpenOnly(o.v)}
                      className={cn('rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                        openOnly === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {o.l}
              </button>
            ))}
          </div>
        } />
      {err ? <div className="mb-4"><Alert>{errorText(err)}</Alert></div> : null}

      <div className="space-y-3">
        {issues.isLoading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />) : null}
        {items.map((i) => {
          const sos = i.type === 'SOS' && i.status !== 'RESOLVED';
          const note = notes[i.id] ?? '';
          return (
            <Card key={i.id} className={cn('relative overflow-hidden p-0', sos && 'border-destructive/40')}>
              {sos ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-destructive" /> : null}
              <div className="flex flex-wrap items-start gap-4 p-5">
                <span className={cn('relative grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                  sos ? 'bg-destructive text-destructive-foreground' : 'bg-accent-soft text-accent-soft-foreground')}>
                  {sos ? <span aria-hidden className="absolute inset-0 rounded-xl bg-destructive animate-pulse-ring" /> : null}
                  {i.type === 'SOS' ? <Siren className="relative h-5 w-5" aria-hidden /> : <MessageSquareWarning className="h-5 w-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold">{i.type === 'SOS' ? 'SOS' : statusLabel(i.type)}</h2>
                    <StatusBadge status={i.status} />
                    <span className="text-xs text-muted-foreground">{istDateTime(i.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={i.partnerName ?? 'Partner'} size={22} />
                      <span className="font-medium">{i.partnerName}</span>
                    </span>
                    {i.location ? (
                      <a className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline" target="_blank" rel="noreferrer"
                         href={`https://www.google.com/maps?q=${i.location.lat},${i.location.lng}`}>
                        <MapPin className="h-3.5 w-3.5" aria-hidden />Location
                      </a>
                    ) : null}
                  </div>
                  {i.description ? <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed">{i.description}</p> : null}
                  {i.resolutionNote ? (
                    <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />Resolution: {i.resolutionNote}
                    </p>
                  ) : null}
                </div>
              </div>
              {can('SUPER_ADMIN', 'OPS_ADMIN') && i.status !== 'RESOLVED' ? (
                <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3">
                  {i.status === 'OPEN' ? <Button size="sm" variant={sos ? 'destructive' : 'outline'} onClick={() => ack.mutate(i.id)}>Acknowledge</Button> : null}
                  <Input className="h-9 min-w-[220px] max-w-sm flex-1" placeholder="What was done?" aria-label="Resolution note" value={note}
                         onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
                  <Button size="sm" disabled={note.trim().length < 3 || resolve.isPending} onClick={() => resolve.mutate({ id: i.id, note: note.trim() })}>Resolve</Button>
                </div>
              ) : null}
            </Card>
          );
        })}
        {issues.data && items.length === 0 ? (
          <Card className="p-0">
            <EmptyState icon={CircleCheck} title={openOnly ? 'No open issues' : 'No issues yet'}
                        description={openOnly ? 'Partners raise issues from the app; they land here within seconds.' : undefined} />
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
