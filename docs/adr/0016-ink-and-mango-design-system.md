# ADR-0016: "Ink & Mango" design system across mobile and admin

**Status:** Proposed. Please confirm the palette and typefaces. Supersedes ADR-0015 for all three surfaces.

**Context.** ADR-0015's "Tiffin" look (warm cream paper, a high-contrast serif, a clay-and-turmeric accent) is the
combination generated interfaces most often default to, so the apps read as templated. The owner asked for a design
that does not look machine-made. Two practical problems also needed fixing: Fraunces and Figtree have no Devanagari,
so the Hindi interface fell back to the system font; and filled buttons faded to 45 % opacity when disabled, which
made their labels unreadable.

**Decision.**
- **Colour** comes from a school morning in India.
  - Royal fountain-pen ink `#2340C9` (the blue of school notebooks) is the brand and the main action colour.
  - Mango `#FFB020` is reserved for the one thing that must be noticed (the box mark, count badges, the rider's
    main call to action). It is only ever a fill under ink text.
  - Leaf green `#12805A` means delivered; sindoor red `#D1293D` means a problem; teal is information.
  - Surfaces are cool notebook paper (`#F1F3F6`) with white cards that need no border in light mode.
  - Dark mode has its own values chosen from the same hues, not an automatic inversion.
- **Type.** Baloo 2 (titles, numbers, the wordmark and the box mark) and Mukta (everything people read). Both are
  from Ek Type, Mumbai, and both include Devanagari, so Hindi is set in the same voice as English. Line heights are
  about 1.3 for display and 1.5 for text so Devanagari matras do not clip.
- **Restraint.** No all-caps tracked labels; sentence-case quiet labels instead. Cards separate by surface contrast,
  not by outline. Disabled filled buttons go flat grey with a readable label. Button labels stay on one line.
- **Signature.** The box mark (ADR-0017), drawn as ink letters and digits on a mango lid with a painted rim.
- **Rider controls.** Irreversible outdoor actions (confirm pickup, hand over at school) use slide-to-confirm, so a
  stray tap from a pocket or a glove does not count. Screen readers get a plain "activate" action instead.
- **Implementation.** Tokens, components, the tiffin illustration, the map style and the tab bar live in
  `packages/ui`. Token names are unchanged except for new `success*` and `inkSurface` keys, so screens compile
  without edits.

**Consequences.**
- The admin console uses the same values as HSL channels in `apps/admin/src/app/globals.css` (with new `success`
  tokens), Baloo 2 and Mukta via `next/font` (self-hosted, so the CSP keeps `font-src 'self'`), sentence-case table
  headers and an ink-navy sidebar. Change both files together.
- `@expo-google-fonts/baloo-2` and `@expo-google-fonts/mukta` replace the Fraunces and Figtree packages (same
  vendor, same licence, so no new library family).
- A literal hex in an app file remains a review flag; the QR code and camera overlays use `palette` constants.
