# ADR-0015: Tiffin design system across mobile and admin

**Status:** Proposed. Please confirm the palette and typefaces.

**Context.** The three surfaces (parent app, partner app, admin console) were built on default component styles with
ad-hoc colours (`#14875A`, `#C62828`, Tailwind blues). They worked but looked generic. The product's promise is trust:
a parent hands over their child's lunch to a stranger. A consistent, warm and deliberate visual language supports
that promise, and it gives riders on bright streets enough contrast.

**Decision.** One design system, "Tiffin", is defined once and implemented per platform.

- **Colour.**
  - Surfaces are warm paper (`#F6F2EA` light, `#141311` dark).
  - The primary colour is curry-leaf green (`#1E5A43`). It carries brand and "go" actions.
  - Turmeric (`#E3A03A`) is the accent, used sparingly: the active nav marker, the partner app's main call to action, and highlights.
  - Chilli (`#B23A24`) is reserved for danger and SOS. Indigo (`#2E4A7D`) is for information.
  - Status colours are never reused as series colours.
- **Charts.**
  - The order-pipeline slots (waiting → moving → done → problem) are validated with the dataviz palette validator against the card surface in each mode.
  - Mid tones were chosen so that adjacent pairs pass the CVD check. The remaining contrast warnings are covered by legends with icons, labels and counts.
  - Bars are at most 24 px wide with 4 px rounded data ends. Lines are 2 px. Grids are solid hairlines. Text never takes the series colour.
- **Type.**
  - Fraunces (display serif) is used only for titles and the wordmark. Figtree (sans) is used for UI, numbers and hero figures.
  - Numbers use tabular figures.
  - Mobile apps bundle both faces via `@expo-google-fonts/*`. The admin self-hosts them via `next/font/google` at build time, so the CSP keeps `font-src 'self'`.
- **Implementation.**
  - **Mobile:** tokens, theme, components, status pills, illustrations and map style live in `packages/ui`. Both apps consume them.
  - **Admin:** the same values are expressed as HSL CSS variables in `globals.css` and mapped into Tailwind.
  - **Dark mode:** each surface has its own dark mode, chosen from the same ramps rather than inverted automatically. The admin offers light, dark or system, saved in local storage, and applies it before first paint with an inline script.
- **Accessibility.**
  - Body text meets 4.5:1 contrast in both modes.
  - Focus rings are always visible. Status is never shown by colour alone: there is always a dot plus a label, or an icon.
  - Motion is skipped under `prefers-reduced-motion`.
  - Mobile hit targets are at least 44 pt, and controls on the partner app's primary actions are larger.

**Consequences.**
- New screens must use tokens, never literal colours. A literal hex in an app file is a review flag. The admin basemap and the QR code are deliberate exceptions.
- Changing the palette means changing `packages/ui/src/tokens.ts` and `apps/admin/src/app/globals.css` together, then re-running the palette validator for the chart slots.
- Two web-font families add a few subset woff2 files to the admin bundle. They are served from CloudFront with long-lived caching.
