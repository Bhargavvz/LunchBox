/** The stacked tiffin mark: three tiers and a carry handle, drawn to sit on the sidebar's leaf green. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="hsl(var(--accent))" />
      <path d="M11 9.5c0-2.2 2.2-3.5 5-3.5s5 1.3 5 3.5" fill="none" stroke="hsl(var(--sidebar))" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="10" width="16" height="4.6" rx="1.6" fill="hsl(var(--sidebar))" />
      <rect x="8" y="15.6" width="16" height="4.6" rx="1.6" fill="hsl(var(--sidebar))" opacity="0.82" />
      <rect x="8" y="21.2" width="16" height="4.6" rx="1.6" fill="hsl(var(--sidebar))" opacity="0.64" />
    </svg>
  );
}
