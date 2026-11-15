# ADR-0017: Box marks on lunchboxes

**Status:** Proposed

**Context.** A rider often carries several lunchboxes to the same school, and children in one class can share a first
name. A six-digit pickup code proves the right rider collected the box. Nothing helped the rider tell boxes apart
afterwards, at the school gate, or gave school staff a way to match a box to a child.

**Decision.** Every child gets a box mark, in the spirit of the codes Mumbai's dabbawalas paint on tiffin lids: two
letters and two digits, for example `KT47`.
- It is **derived** from the child's UUID (`BoxCode.of`, a SplitMix64 hash). It needs no column or migration and never
  changes for a child.
- Letters and digits that are easily misread when handwritten (I, O, Q, 0, 1) are excluded: 23 × 23 × 8 × 8 = 33,856
  combinations. Codes are not unique platform-wide. They only need to separate the few boxes on one route, and they
  are always shown next to the child's first name and class.
- It reveals nothing about the child, so riders may see it (the child-safety rule allows first name and class).

Where it appears:
- `ChildResponse.boxCode`: parents see it on the child card and the child form, with "Write ZB96 on the lid".
- `OrderResponse.boxCode`: on the Today card and the tracking screen.
- `PickupStopDetails.boxCode`: large on the rider's pickup screen ("Match this mark on the lid before you take the
  box").
- `DropStopDetails.boxes[]` (`orderId`, `orderStatus`, `childFirstName`, `className`, `boxCode`): the rider ticks each
  box at the school gate before the slide-to-hand-over control unlocks.

**Consequences.**
- `orderIds` stays on `DropStopDetails` for older app builds.
- If two children on one route ever share a mark, first name and class still disambiguate. Making marks unique per
  school would need a stored, allocated code; revisit if operations report a clash.
- Tests: `BoxCodeTest` (format, stability, spread across UUIDv7 neighbours).
