# Design

## World
A field notebook, not a fintech dashboard. Warm paper in light mode, slate
night in dark mode. Hairline rules separate rows; no floating cards, no
drop-shadow stacks, no gradients, no glassmorphism.

## Type
- UI: "Geist" (400/500/600). Numbers always `font-variant-numeric: tabular-nums`.
- Display numbers (balances): Geist 600, tight tracking (-0.02em).
- Scale: 12 / 13 / 15 / 17 / 22 / 34.

## Color (tokens in `web/src/styles/tokens.css`)
- `--paper` page, `--ink` text, `--ink-2` secondary, `--ink-3` tertiary, `--rule` hairlines.
- One accent: `--accent` deep juniper green, used for primary actions and the
  active tab only.
- Money semantics: `--plus` (owed to you), `--minus` (you owe). Never used decoratively.
- Member dots: 8 muted hues, one per member, for quick scanning.

## Layout
- Mobile-first, single column, max-width 560px centered on desktop.
- Lists are full-bleed rows with 16px gutters, 56px min row height.
- Bottom tab bar (Home, Spend, + , Settle, Trip). Center "+" opens the add sheet.

## Motion (Emil Kowalski rules)
- Tab switches: no slide, a 140ms opacity crossfade only (used constantly).
- Pushed screens: slide in from right 280ms `cubic-bezier(0.32,0.72,0,1)`.
- Sheets: Vaul drawer, drag-to-dismiss, iOS drawer curve.
- Press feedback: `scale(0.97)` on `:active`, 140ms ease-out.
- List insertions: 200ms fade + 6px rise. No stagger on lists users revisit.
- `prefers-reduced-motion`: drop all translation, keep opacity.

## Copy
Plain, short, second person. "You owe Asha Rs 860", not "Outstanding liability".
