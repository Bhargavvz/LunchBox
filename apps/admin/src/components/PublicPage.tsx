import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './Brand';

/** The support address shown on public pages, from NEXT_PUBLIC_SUPPORT_EMAIL (set at build time). */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '';

/** A readable public page (no sign-in): privacy policy, account deletion. */
export function PublicPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <BrandMark className="h-8 w-8" />
          <span className="font-display text-xl font-semibold">LunchBox</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {updated}</p>
        <article className="prose-lb mt-8 space-y-6 text-[15px] leading-7">{children}</article>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-4 px-4 py-6 text-sm text-muted-foreground">
          <Link href="/privacy/" className="hover:underline">Privacy policy</Link>
          <Link href="/delete-account/" className="hover:underline">Delete your account</Link>
          {SUPPORT_EMAIL ? <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:underline">{SUPPORT_EMAIL}</a> : null}
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-2xl font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
