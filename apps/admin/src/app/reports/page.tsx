'use client';

import { addDays, todayIst } from '@lunchbox/api-client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, CardTitle, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { downloadBlob } from '@/lib/utils';

export default function ReportsPage() {
  const [from, setFrom] = useState(addDays(todayIst(), -30));
  const [to, setTo] = useState(todayIst());
  const onTime = useQuery({ queryKey: ['r-ontime', from, to], queryFn: () => api.admin.onTimeReport(from, to) });
  const perf = useQuery({ queryKey: ['r-perf', from, to], queryFn: () => api.admin.partnerPerformance(from, to) });
  const failures = useQuery({ queryKey: ['r-fail', from, to], queryFn: () => api.admin.failures(from, to) });
  const err = onTime.error ?? perf.error ?? failures.error;

  return (
    <AppShell>
      <PageHeader title="Reports" description="Served from the read replica; figures can lag live data by a few seconds." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="r-from"><Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="r-to"><Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button variant="outline" onClick={async () => downloadBlob(await api.admin.downloadCsv('/api/v1/admin/reports/on-time.csv', { from, to }), `on-time-${from}-${to}.csv`)}>On-time CSV</Button>
        <Button variant="outline" onClick={async () => downloadBlob(await api.admin.downloadCsv('/api/v1/admin/reports/partner-performance.csv', { from, to }), `partners-${from}-${to}.csv`)}>Partner CSV</Button>
      </div>
      {err ? <Alert>{errorText(err)}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>On-time delivery rate (%)</CardTitle>
          <div className="h-64" role="img" aria-label="Line chart of daily on-time delivery rate">
            <ResponsiveContainer>
              <LineChart data={onTime.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="onTimeRate" stroke="#14875A" strokeWidth={2} dot={false} name="On-time %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle>Failed deliveries by reason</CardTitle>
          <div className="h-64" role="img" aria-label="Bar chart of failed deliveries by reason">
            <ResponsiveContainer>
              <BarChart data={(failures.data ?? []).slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="reason" width={160} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#C62828" name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card className="mt-6">
        <CardTitle>Partner performance</CardTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">Partner</th><th>Assigned</th><th>Delivered</th><th>On-time %</th><th>Pickup failed</th><th>Delivery failed</th><th>Rating</th></tr>
            </thead>
            <tbody>
              {perf.data?.map((r) => (
                <tr key={r.partnerId} className="border-t">
                  <td className="py-1">{r.partnerName}</td><td>{r.assigned}</td><td>{r.delivered}</td><td>{r.onTimeRate}</td>
                  <td>{r.pickupFailed}</td><td>{r.deliveryFailed}</td><td>{r.rating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
