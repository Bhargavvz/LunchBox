'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { state } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (state.kind === 'ready') {
      router.replace(state.me.role === 'SCHOOL_ADMIN' ? '/school/' : '/dashboard/');
    } else if (state.kind !== 'loading') {
      router.replace('/login/');
    }
  }, [state, router]);
  return <p className="p-8 text-muted-foreground">Loading…</p>;
}
