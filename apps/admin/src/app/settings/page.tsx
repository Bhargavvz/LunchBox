'use client';

import { istDateTime } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, Input, PageHeader, Textarea } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.admin.settings });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ key, raw, version }: { key: string; raw: string; version: number }) => {
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error('Value must be valid JSON (strings in "quotes").');
      }
      return api.admin.updateSetting(key, value, version);
    },
    onSuccess: (_d, v) => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[v.key];
        return next;
      });
      setError(null);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => setError(errorText(e)),
  });
  const editable = can('SUPER_ADMIN');
  return (
    <AppShell>
      <PageHeader eyebrow="Admin" title="Settings" description="Cut-off times, geofence radii and partner pay rates. Changes apply within 30 seconds." />
      {settings.error ? <Alert>{errorText(settings.error)}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <div className="space-y-3">
        {settings.data?.map((s) => {
          const raw = drafts[s.key] ?? JSON.stringify(s.value, null, s.value && typeof s.value === 'object' ? 2 : 0);
          const isObject = typeof s.value === 'object' && s.value !== null;
          return (
            <Card key={s.key}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{s.key}</p>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  <p className="text-xs text-muted-foreground">Updated {istDateTime(s.updatedAt)}</p>
                </div>
                <div className="flex min-w-72 flex-1 items-start gap-2">
                  {isObject ? (
                    <Textarea aria-label={s.key} className="min-h-40 font-mono text-xs" readOnly={!editable} value={raw}
                              onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })} />
                  ) : (
                    <Input aria-label={s.key} className="font-mono" readOnly={!editable} value={raw}
                           onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })} />
                  )}
                  {editable ? (
                    <Button disabled={drafts[s.key] === undefined || save.isPending}
                            onClick={() => save.mutate({ key: s.key, raw, version: s.version })}>Save</Button>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
