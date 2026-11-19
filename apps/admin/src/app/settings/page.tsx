'use client';

import { istDateTime, rupees } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Database, KeyRound, MapPin, ShieldCheck, SlidersHorizontal, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { WeightsEditor } from '@/components/allocation';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, CardHeader, Dialog, DialogContent, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Setting = { key: string; value: unknown; description?: string | null; updatedAt: string; version: number };

const FIELDS: Record<string, { label: string; unit?: string; type: 'time' | 'int'; min?: number; max?: number }> = {
  'order.cutoff_time': { label: 'Daily cut-off (IST)', type: 'time' },
  'order.pickup_lead_minutes': { label: 'Pickup starts before the school window', unit: 'min', type: 'int', min: 15, max: 240 },
  'order.pickup_window_minutes': { label: 'Length of the home pickup window', unit: 'min', type: 'int', min: 10, max: 120 },
  'geofence.home_arrival_radius_m': { label: 'Counts as "arrived" within', unit: 'm of the home', type: 'int', min: 20, max: 500 },
  'geofence.default_school_radius_m': { label: 'School gate radius (no polygon)', unit: 'm', type: 'int', min: 50, max: 2000 },
  'dispatch.pickup_wait_minutes': { label: 'Rider waits at a door before "not available"', unit: 'min', type: 'int', min: 1, max: 30 },
  'dispatch.no_show_grace_minutes': { label: 'No-show after shift start', unit: 'min', type: 'int', min: 5, max: 120 },
};

const PAY: { key: string; label: string }[] = [
  { key: 'baseDayPaise', label: 'Per shift' }, { key: 'perDeliveryPaise', label: 'Per delivery' },
  { key: 'perKmPaise', label: 'Per km' }, { key: 'onTimeBonusPaise', label: 'On-time bonus' },
  { key: 'failedDeliveryPenaltyPaise', label: 'Failed delivery penalty' }, { key: 'noShowPenaltyPaise', label: 'No-show penalty' },
  { key: 'minPayoutPaise', label: 'Minimum payout' },
];

function useSave(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value, version }: { key: string; value: unknown; version: number }) => api.admin.updateSetting(key, value, version),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      onDone?.();
    },
  });
}

function SimpleSetting({ s, editable }: { s: Setting; editable: boolean }) {
  const f = FIELDS[s.key]!;
  const [value, setValue] = useState(String(s.value ?? ''));
  useEffect(() => setValue(String(s.value ?? '')), [s.value]);
  const save = useSave();
  const parsed = f.type === 'int' ? Number(value) : value;
  const dirty = String(s.value) !== value;
  return (
    <div className="flex flex-wrap items-end gap-3 border-b py-3 last:border-0">
      <div className="min-w-60 flex-1">
        <Field label={f.label} htmlFor={s.key} hint={s.description ?? undefined}>
          <div className="flex items-center gap-2">
            <Input id={s.key} type={f.type === 'time' ? 'time' : 'number'} min={f.min} max={f.max} className="w-36"
                   disabled={!editable} value={value} onChange={(e) => setValue(e.target.value)} />
            {f.unit ? <span className="text-sm text-muted-foreground">{f.unit}</span> : null}
          </div>
        </Field>
      </div>
      {editable ? (
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({ key: s.key, value: parsed, version: s.version })}>Save</Button>
      ) : null}
      <p className="w-full text-xs text-muted-foreground">
        Updated {istDateTime(s.updatedAt)}{save.error ? <span className="ml-2 text-destructive">{errorText(save.error)}</span> : null}
      </p>
    </div>
  );
}

function PayRates({ s, editable }: { s: Setting; editable: boolean }) {
  const current = s.value as Record<string, number>;
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => setDraft(Object.fromEntries(PAY.map((p) => [p.key, String((current[p.key] ?? 0) / 100)]))), [s.value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave();
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      save.mutate({ key: s.key, value: Object.fromEntries(PAY.map((p) => [p.key, Math.round(Number(draft[p.key] ?? 0) * 100)])), version: s.version });
    }}>
      {save.error ? <Alert>{errorText(save.error)}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {PAY.map((p) => (
          <Field key={p.key} label={`${p.label} (₹)`} htmlFor={`pay-${p.key}`} hint={`Now ${rupees(current[p.key] ?? 0)}`}>
            <Input id={`pay-${p.key}`} type="number" min={0} step="0.5" disabled={!editable} value={draft[p.key] ?? ''}
                   onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      {editable ? <Button className="mt-3" type="submit" disabled={save.isPending}>Save pay rates</Button> : null}
    </form>
  );
}

function DemoData({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['demo-data'], queryFn: api.admin.demoData });
  const [confirm, setConfirm] = useState<'load' | 'remove' | null>(null);
  const done = () => {
    setConfirm(null);
    void qc.invalidateQueries();
  };
  const load = useMutation({ mutationFn: api.admin.loadDemoData, onSuccess: done });
  const remove = useMutation({ mutationFn: api.admin.removeDemoData, onSuccess: done });
  const records = (status.data?.records ?? {}) as Record<string, number>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Loads four demo schools, forty families, twelve riders and thirty days of deliveries, payments and allocation
        decisions so every page and chart has something to show. Demo schools and riders are inactive, so real parents
        never see them and they never get real work. Everything is tagged and removed in one step.
      </p>
      {load.error ?? remove.error ? <Alert>{errorText(load.error ?? remove.error)}</Alert> : null}
      {status.data?.present ? (
        <p className="text-sm">Loaded: {Object.entries(records).map(([t, n]) => `${n} ${t.replace('_', ' ')}`).join(', ')}.</p>
      ) : <p className="text-sm">No demo data is loaded.</p>}
      {editable ? (
        <div className="flex gap-2">
          <Button variant="outline" disabled={status.data?.present || load.isPending} onClick={() => setConfirm('load')}>Load demo data</Button>
          <Button variant="destructive" disabled={!status.data?.present || remove.isPending} onClick={() => setConfirm('remove')}>Remove demo data</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Only a super admin can load or remove demo data.</p>}
      {confirm ? (
        <Dialog open onOpenChange={(o) => !o && setConfirm(null)}>
          <DialogContent title={confirm === 'load' ? 'Load demo data?' : 'Remove demo data?'}
                         description={confirm === 'load' ? 'Adds tagged demo records. Real data is not changed.' : 'Deletes every demo record and nothing else. This cannot be undone.'}>
            <div className="flex gap-2">
              <Button variant={confirm === 'remove' ? 'destructive' : 'default'} disabled={load.isPending || remove.isPending}
                      onClick={() => (confirm === 'load' ? load.mutate() : remove.mutate())}>
                {confirm === 'load' ? 'Load demo data' : 'Remove demo data'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Keep as is</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function Section({ icon, title, description, children }: { icon: typeof Clock; title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} />
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.admin.settings });
  const editable = can('SUPER_ADMIN');
  const byKey = new Map((settings.data ?? []).map((s) => [s.key, s as Setting]));
  const group = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((s): s is Setting => !!s)
    .map((s) => <SimpleSetting key={s.key} s={s} editable={editable} />);

  return (
    <AppShell>
      <PageHeader eyebrow="Admin" title="Settings" description="How the day runs. Changes apply within 30 seconds and are logged." />
      {settings.error ? <Alert>{errorText(settings.error)}</Alert> : null}
      {!editable ? <Alert tone="info">You can view settings; only a super admin can change them.</Alert> : null}
      <div className="grid gap-4">
        <Section icon={Clock} title="Orders and cut-off" description="When the next day freezes and when riders come to homes.">
          {group(['order.cutoff_time', 'order.pickup_lead_minutes', 'order.pickup_window_minutes'])}
        </Section>
        <Section icon={MapPin} title="Pickup and arrival" description="Geofences and waiting times riders work with.">
          {group(['geofence.home_arrival_radius_m', 'geofence.default_school_radius_m', 'dispatch.pickup_wait_minutes', 'dispatch.no_show_grace_minutes'])}
        </Section>
        <Section icon={SlidersHorizontal} title="Rider allocation" description="How the engine weighs distance, schools, fairness, rating and reliability. Runs and their reasons are on the Rider allocation page.">
          <WeightsEditor editable={editable} />
        </Section>
        <Section icon={Wallet} title="Rider pay" description="What riders earn per shift, delivery and km, and penalties.">
          {byKey.get('pay.rates') ? <PayRates s={byKey.get('pay.rates')!} editable={editable} /> : null}
        </Section>
        <Section icon={KeyRound} title="Sign-in codes" description="SMS codes are sent and checked by Firebase Authentication; the apps add these limits.">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>6-digit code by SMS; valid for 10 minutes, with a countdown in the app.</li>
            <li>Resend waits 30 s, then 45 s, 1, 2 and 5 minutes; at most 5 codes per number in 30 minutes.</li>
            <li>5 wrong codes and the app asks for a new one; Firebase also blocks numbers that try too often.</li>
            <li>Admins sign in with email, password and an authenticator app (second step).</li>
          </ul>
        </Section>
        <Section icon={ShieldCheck} title="Admin users and roles" description="Who can use this panel and what each role may do.">
          <Link href="/staff/" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Open Staff, roles and permissions</Link>
        </Section>
        <Section icon={Database} title="Demo data" description="Realistic, tagged sample data for trying every page.">
          <DemoData editable={editable} />
        </Section>
      </div>
    </AppShell>
  );
}
