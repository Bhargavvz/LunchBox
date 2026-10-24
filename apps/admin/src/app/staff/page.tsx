'use client';

import { istDateTime } from '@lunchbox/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, Button, Card, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';

type StaffRole = 'SUPER_ADMIN' | 'OPS_ADMIN' | 'SUPPORT' | 'SCHOOL_ADMIN';

export default function StaffPage() {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.admin.staff() });
  const schools = useQuery({ queryKey: ['schools-all'], queryFn: () => api.admin.schools(undefined, 0, 200) });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('OPS_ADMIN');
  const [schoolId, setSchoolId] = useState('');
  const create = useMutation({
    mutationFn: () => api.admin.createStaff({ email, displayName: name, role, schoolId: role === 'SCHOOL_ADMIN' ? schoolId : undefined }),
    onSuccess: () => { setEmail(''); setName(''); void qc.invalidateQueries({ queryKey: ['staff'] }); },
  });
  return (
    <AppShell roles={['SUPER_ADMIN']}>
      <PageHeader eyebrow="Admin" title="Staff" description="Create the Firebase user (email + password) in the Firebase console, then grant a role here. Staff must enrol an authenticator app on first sign-in." />
      <Card className="mb-6 max-w-3xl">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
          {create.error ? <div className="md:col-span-4"><Alert>{errorText(create.error)}</Alert></div> : null}
          <Field label="Email" htmlFor="st-email"><Input id="st-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Name" htmlFor="st-name"><Input id="st-name" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Role" htmlFor="st-role">
            <Select id="st-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {(['SUPER_ADMIN', 'OPS_ADMIN', 'SUPPORT', 'SCHOOL_ADMIN'] as const).map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          {role === 'SCHOOL_ADMIN' ? (
            <Field label="School" htmlFor="st-school">
              <Select id="st-school" required value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="">Choose…</option>
                {schools.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          ) : <div />}
          <div className="md:col-span-4"><Button type="submit" disabled={create.isPending}>Grant access</Button></div>
        </form>
      </Card>
      <div className="lb-table-wrap"><table className="lb-table">
        <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
        <tbody>
          {staff.data?.items.map((s) => (
            <tr key={s.userId}>
              <td>{s.email}</td><td>{s.displayName}</td><td>{s.role}</td>
              <td><StatusBadge status={s.status} /></td><td>{istDateTime(s.lastLoginAt)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </AppShell>
  );
}
