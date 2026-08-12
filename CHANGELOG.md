# Changelog

All notable changes to `sr2e-pink-fohawk`.

## [Unreleased]

### Added
- **Mel** (government name Melvin Offaleater) — troll melee specialist, uncle to Tina Bonemeal.
  Built from real compendium items in `sr2e` and `sr2e-shadowtech`: titanium
  bone lacing, two retractable spurs, Wired Reflexes 2, Muscle Augmentation 4,
  Suprathyroid Gland, Enhanced Articulation, a Reflex Recorder, and Full Heavy
  Armor. Chargen A/B/C/D/E (race/attributes/resources/skills/magic) plus a
  veteran allowance of 500,000¥ and 30 Karma.
- `npm run sheet` — a printable one-page SR2-styled PDF character sheet,
  rendered from the pack JSON via SVG and `rsvg-convert`. Derived values come
  from the system's own exported rules helpers, so the sheet cannot drift from
  what Foundry loads.
- `npm run validate` — asserts chargen point spend against the system's
  priority table, the Essence and Body Index ceilings, 16-character document
  ids, and that every referenced portrait exists on disk.

### Notes
- Mel's Reaction is **10**, not 8. Muscle Augmentation is *not* Muscle
  Replacement: "Quickness acquired through muscle augmentation can increase the
  calculated Reaction Rating" (Shadowtech p.35). The two implants read alike and
  the distinction is easy to get backwards.
