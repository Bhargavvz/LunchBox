# ADR-0022: "Chalk & Turmeric" design system for the apps and the admin panel

**Status:** Accepted (owner asked for a complete, distinctive redesign of both apps and the admin panel). Supersedes
ADR-0016 everywhere.

**Context.** The owner did not like the "Ink & Mango" apps: the royal-blue brand looked like many other delivery and
fintech apps, empty screens were grey boxes that said nothing useful, and greetings set at display size wrapped onto
two lines. They asked for a look that is clean, clear and unlike any other app.

**Decision.** The design is built around one object from the product's own world: the stacked steel tiffin carrier
(dabba). Its tiers, rim and painted lid code become the interface's shapes.

- **Colour.**
  - Brand and main actions: chalk green `#1D4F47`, the green of a school blackboard. Pressed `#153C36`, soft `#DCEBE6`.
  - Accent: turmeric `#F2A93B`. Used only for the one thing that needs the parent now: the current journey tier, the
    next setup step, box marks, unread markers and count badges. Always under dark text, never as text colour.
  - Delivered is sprout green `#2F8F4E`. Problems are chilli red `#C8412D`. Information is uniform blue `#2F6FA8`.
  - Text is charcoal `#16201D` on a cool steel background `#F3F5F4`. Cards are white with a 1 px line; only the main
    card on a screen is raised.
  - Dark mode has its own values from the same hues (background `#0E1513`, brand `#7FD3BE`, accent `#FFC064`).
- **Type.**
  - Khand, a condensed face cut from Indian hand-painted signboards, sets titles, times, prices and box marks.
  - Hind (Indian Type Foundry) sets everything people read.
  - Both carry Devanagari, so Hindi is set in the same voice as English.
  - Labels are sentence case; there are no tracked all-caps eyebrows.
- **Shapes.**
  - Buttons have a 3 px darker bottom lip, the pressed rim of a steel tier.
  - The active tab icon sits on a chalk "lid" pill.
  - Order progress is drawn as three tiffin tiers (home, on the way, school) joined by clamps. Done tiers are chalk,
    the current one is turmeric and breathes gently, a problem tier is chilli, later tiers are steel.
  - The new-account setup on Today is the same tiers stacked vertically: add child → add address → choose a plan.
    Only the current step has a button.
- **Empty states** are invitations to act. Each is an open tray with a dashed rim, the tiffin drawing on a chalk
  plate, a title saying what is missing, and the action that fills it. Secondary summaries use a pale chalk tray
  instead of a grey inset.
- **Background.** Faint hand-drawn school doodles (bag, tiffin, book, pencil, apple) tile behind parent screens at
  about 8 % opacity. Every list and card sits on an opaque surface so the doodles never sit behind text.
- **Maps** use a desaturated steel-and-chalk style so the rider marker and destination are the only saturated things.
- **Admin panel.** The same tokens as HSL variables in `apps/admin/src/app/globals.css`, Khand and Hind through
  `next/font`. A light steel sidebar whose active page sits on a chalk pill (the apps' tab-bar mark), flat white
  cards with a hairline, Khand page titles and figures, and buttons with the tiffin rim. The one bold surface is the
  dashboard's chalkboard panel: today's pickups in large chalk figures, on-time rate, and the order pipeline drawn as
  tiffin tiers (waiting, on the road, delivered, failed) sized by their share of the day. The sign-in hero uses the
  same chalkboard.

**Consequences.**
- All tokens live in `packages/ui/src/tokens.ts` (apps) and `apps/admin/src/app/globals.css` (admin, same values);
  screens hold no hex colours (the receipt HTML, map styles and camera overlays' white are the documented exceptions).
- Launcher icons and splash screens are redrawn in chalk and turmeric (`docs/brand`, `apps/*/assets`).
