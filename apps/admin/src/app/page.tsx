'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BrandMark } from '@/components/Brand';
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
  return (
    <main className="grid min-h-screen place-items-center bg-background" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <BrandMark className="h-12 w-12 animate-pulse" />
        <p className="text-sm text-muted-foreground">Opening the console…</p>
      </div>
    </main>
  );
}
