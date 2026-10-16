'use client';

import { istTime, todayIst, type AdminAlert, type LivePartnerMessage } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MapFrame, PartnerMarkers } from '@/components/maps';
import { Alert, Badge, Card, CardTitle, PageHeader } from '@/components/ui/primitives';
import { api, errorText, realtime } from '@/lib/api';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${tone ?? ''}`}>{value}</p>
    </Card>
  );
}

export default function DashboardPage() {
  const date = todayIst();
  const dash = useQuery({ queryKey: ['dashboard', date], queryFn: () => api.admin.dashboard(date), refetchInterval: 30_000 });
  const initial = useQuery({ queryKey: ['live-partners'], queryFn: api.admin.livePartners });
  const [live, setLive] = useState<Record<string, LivePartnerMessage & { label: string }>>({});
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);

  useEffect(() => {
    if (!initial.data) return;
    setLive(Object.fromEntries(initial.data.map((p) => [p.partnerId, {
      partnerId: p.partnerId, lat: p.lat, lng: p.lng, headingDeg: p.headingDeg, speedMps: p.speedMps,
      activeOrders: p.activeOrders, at: p.recordedAt, label: p.name ?? p.partnerId,
    }])));
  }, [initial.data]);

  useEffect(() => {
    realtime.connect();
    const offLive = realtime.subscribeAdminLive((m) =>
      setLive((cur) => ({ ...cur, [m.partnerId]: { ...m, label: cur[m.partnerId]?.label ?? m.partnerId } })));
    const offAlerts = realtime.subscribeAdminAlerts((a) => setAlerts((cur) => [a, ...cur].slice(0, 50)));
    return () => {
      offLive();
      offAlerts();
    };
  }, []);

  const d = dash.data;
  const inTransit = d ? ['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL'].reduce((n, s) => n + (d.ordersByStatus[s] ?? 0), 0) : 0;
  const failed = d ? (d.ordersByStatus['PICKUP_FAILED'] ?? 0) + (d.ordersByStatus['DELIVERY_FAILED'] ?? 0) : 0;

  return (
    <AppShell>
      <PageHeader title="Today" description={`Operations for ${date} (IST)`} />
      {dash.error ? <Alert>{errorText(dash.error)}</Alert> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Pickups today" value={d?.total ?? '—'} />
        <Stat label="Unassigned" value={d?.unassigned ?? '—'} tone={d && d.unassigned > 0 ? 'text-destructive' : ''} />
        <Stat label="In transit" value={inTransit} />
        <Stat label="Delivered" value={d?.delivered ?? '—'} />
        <Stat label="Failed" value={failed} tone={failed > 0 ? 'text-destructive' : ''} />
        <Stat label="On-time" value={d ? `${d.onTimeRate}%` : '—'} />
        <Stat label="Partners on shift" value={d ? `${d.activePartners}/${d.scheduledPartners}` : '—'} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardTitle className="mb-2">Live partners ({Object.keys(live).length})</CardTitle>
          <MapFrame label="Live map of delivery partners">
            <PartnerMarkers partners={Object.values(live).map((p) => ({ partnerId: p.partnerId, lat: p.lat, lng: p.lng,
              label: `${p.label} · ${p.activeOrders} active · ${istTime(p.at)}` }))} />
          </MapFrame>
        </div>
        <Card>
          <CardTitle>Alerts {d && d.openIssues > 0 ? <Badge tone="danger">{d.openIssues} open issues</Badge> : null}</CardTitle>
          <ul className="mt-3 space-y-2 text-sm" aria-live="polite">
            {alerts.length === 0 ? <li className="text-muted-foreground">No alerts since this page opened.</li> : null}
            {alerts.map((a, i) => (
              <li key={`${a.at}-${i}`} className="rounded border p-2">
                <Badge tone={a.type.includes('SOS') || a.type.includes('FAILED') ? 'danger' : 'warning'}>{a.type}</Badge>
                <p className="mt-1">{a.message}</p>
                <p className="text-xs text-muted-foreground">{istTime(a.at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
