import type { Metadata, Viewport } from 'next';
import { Baloo_2, Mukta } from 'next/font/google';
import type { ReactNode } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/themeKey';
import { Providers } from './providers';
import './globals.css';

// Self-hosted at build time by next/font, so the CSP's font-src 'self' holds and no request leaves for Google.
// Mukta for text, Baloo 2 for titles and figures: both carry Devanagari, matching the mobile apps (ADR-0016).
const sans = Mukta({ subsets: ['latin', 'devanagari'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const display = Baloo_2({ subsets: ['latin', 'devanagari'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'LunchBox Admin', template: '%s · LunchBox Admin' },
  description: 'Operations console for LunchBox school meal delivery',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F1F3F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0D1220' },
  ],
};

// Applies the saved (or system) theme before first paint so the page never flashes the wrong palette.
const themeScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||((s===null||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
