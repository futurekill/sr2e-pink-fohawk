# QA Plan — sr2e-pink-fohawk

Automated coverage is `npm run validate` (chargen arithmetic, Essence/Body
Index ceilings, id shape, art on disk). Everything below needs a live Foundry
world, because it is sheet rendering and combat resolution — neither of which
the validator can see.

## Before every release

```bash
npm run gen && npm run validate && npm run build-packs && npm run sheet
```

Foundry must be closed while `build-packs` runs (LevelDB locks the directory).

## In-world checks

Import Mel from the **Pink Fohawk — Cast** compendium onto a scene, then:

| # | Check | Expected |
|---|-------|----------|
| 1 | Open the character sheet | Portrait renders; no blank-image icon |
| 2 | Attributes header | Body 14, Quickness 7, Strength 16, Charisma 1, Intelligence 2, Willpower 1 |
| 3 | Derived header | Reaction 10, Initiative 10 + 3d6, Combat Pool 4, Karma Pool 4 |
| 4 | Essence / Body Index | 0.15 Essence left; Body Index 5.45 / 11 |
| 5 | Armour | 9 / 7 (Full Heavy 8/6 + 1/1 titanium lacing) |
| 6 | Roll Damage Resistance | 15 dice (Body 14 + 1 troll Dermal Armour) |
| 7 | Attack with fists | 19M Stun |
| 8 | Attack with a spur | 18L Physical, Armed Combat 7 |
| 9 | Roll Initiative in combat | Three dice; he acts on two passes against a Reaction 4 opponent |
| 10 | Drop the token on a 1 m grid | Occupies 2×2; token is linked (edits to the sheet follow the token) |

**Combat Pool is 4, not 5** — Full Heavy Armor is flagged `heavyArmor`, costing
one die per point of Ballistic over Quickness (8 − 7 = 1, SR2E p.84). If the
sheet shows 5, the heavy flag was lost on the armour item.

## Dependencies

Requires system `sr2e` ≥ 0.89.0 and module `sr2e-shadowtech` (Mel's bioware
comes from it). With Shadowtech disabled the actor still imports, but the
bioware items lose their source and Body Index reads 0.

## Known gaps

- Tina Bonemeal exists only as Mel's contact, not as her own NPC actor.
- No scenes, journals, or roll tables yet — this module is cast-only.
