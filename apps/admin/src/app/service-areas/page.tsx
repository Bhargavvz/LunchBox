'use client';

import type { GeoPoint, Schemas } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MapFrame, PolygonEditor } from '@/components/maps';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Area = Schemas['ServiceAreaResponse'];

export default function ServiceAreasPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const areas = useQuery({ queryKey: ['service-areas'], queryFn: api.admin.serviceAreas });
  const [selected, setSelected] = useState<Area | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [active, setActive] = useState(true);
  const [boundary, setBoundary] = useState<GeoPoint[]>([]);
  const writable = can('SUPER_ADMIN', 'OPS_ADMIN');

  function edit(a: Area | null) {
    setSelected(a);
    setName(a?.name ?? '');
    setCity(a?.city ?? '');
    setActive(a?.active ?? true);
    setBoundary(a?.boundary ?? []);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name, city, boundary, active };
      return selected ? api.admin.updateServiceArea(selected.id, body) : api.admin.createServiceArea(body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['service-areas'] }); edit(null); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteServiceArea(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['service-areas'] }); edit(null); },
  });

  return (
    <AppShell>
      <PageHeader title="Service areas" description="Addresses outside every active area cannot be added by parents." />
      {areas.error ?? save.error ?? remove.error ? <Alert>{errorText(areas.error ?? save.error ?? remove.error)}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-2">
          {areas.data?.map((a) => (
            <button key={a.id} onClick={() => edit(a)}
                    className={`block w-full rounded border p-2 text-left text-sm ${selected?.id === a.id ? 'border-primary' : ''}`}>
              <span className="font-medium">{a.name}</span> · {a.city} {a.active ? '' : '(inactive)'}
              <span className="block text-xs text-muted-foreground">{a.boundary.length} vertices</span>
            </button>
          ))}
          {writable ? <Button variant="outline" className="w-full" onClick={() => edit(null)}>New area</Button> : null}
        </Card>
        <div className="space-y-3 lg:col-span-2">
          <MapFrame label="Service area editor" height={460}>
            <PolygonEditor value={boundary} onChange={setBoundary} readOnly={!writable} />
          </MapFrame>
          {writable ? (
            <Card className="space-y-3">
              <p className="text-sm text-muted-foreground">Click the map to add vertices; drag the white handles to adjust.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Name" htmlFor="a-name"><Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="City" htmlFor="a-city"><Input id="a-city" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
              <div className="flex gap-2">
                <Button disabled={boundary.length < 3 || !name || !city || save.isPending} onClick={() => save.mutate()}>Save area</Button>
                <Button variant="ghost" onClick={() => setBoundary([])}>Clear</Button>
                {selected && can('SUPER_ADMIN') ? <Button variant="destructive" onClick={() => remove.mutate(selected.id)}>Delete</Button> : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
