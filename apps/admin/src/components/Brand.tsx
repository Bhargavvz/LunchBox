/**
 * The LunchBox mark, as on the app icons: a three-tier tiffin with chalk-green tiers, a turmeric middle tier and a
 * charcoal lid and clamps. Drawn inline so it follows the theme (the clamps lighten in dark mode).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />
      <path d="M12.5 9.2c0-2.3 1.6-3.6 3.5-3.6s3.5 1.3 3.5 3.6" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="8.5" y="9.6" width="15" height="5" rx="1.8" fill="hsl(var(--primary-foreground))" />
      <rect x="8.5" y="15.4" width="15" height="5" rx="1.8" fill="hsl(var(--accent))" />
      <rect x="13.5" y="17.2" width="5" height="1.4" rx="0.6" fill="hsl(var(--accent-foreground))" opacity="0.8" />
      <rect x="8.5" y="21.2" width="15" height="5" rx="1.8" fill="hsl(var(--primary-foreground))" />
    </svg>
  );
}

/** The tiffin on its own, for empty states: chalk tiers, a turmeric middle tier, a rim under each. */
export function TiffinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" className={className} aria-hidden>
      <path d="M14 13c0-6 12-6 12 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="8.5" y="11" width="2.6" height="34" rx="1.3" fill="currentColor" />
      <rect x="28.9" y="11" width="2.6" height="34" rx="1.3" fill="currentColor" />
      <rect x="4" y="15" width="32" height="9.5" rx="3" fill="hsl(var(--primary))" />
      <rect x="4" y="25.5" width="32" height="9.5" rx="3" fill="hsl(var(--accent))" />
      <rect x="4" y="36" width="32" height="9.5" rx="3" fill="hsl(var(--primary))" />
      <rect x="16" y="28.6" width="8" height="2.8" rx="1" fill="hsl(var(--accent-foreground))" opacity="0.8" />
    </svg>
  );
}
