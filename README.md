# Shadowrun 2E: Pink Fohawk

A Foundry VTT V13 module for the [Shadowrun 2nd Edition system](https://github.com/futurekill/sr2e-foundryvtt) (`sr2e`). Player characters and cast for the Pink Fohawk table.

## Contents

| Pack | Contents |
|---|---|
| Pink Fohawk — Cast | 1 actors |

## Notes

- Needs the [Shadowtech](https://github.com/futurekill/sr2e-shadowtech) module for bioware and bone lacing.
- `npm run sheet` prints a character sheet PDF; releases attach it.

## Requirements

- Foundry VTT V13
- The `sr2e` system, version 0.89.0 or later
- The `sr2e-shadowtech` module

## Installation

In Foundry, **Add-on Modules → Install Module**, and paste this manifest URL:

```
https://github.com/futurekill/sr2e-pink-fohawk/releases/latest/download/module.json
```

Then enable it in your world (**Game Settings → Manage Modules**).

## Development

`packs-src/` (one JSON file per document) is the source of truth. `packs/` is built from it, gitignored, and rebuilt by the release workflow.

```bash
npm install
npm run build-packs     # packs-src/ JSON -> packs/ LevelDB (close Foundry first)
npm run extract-packs   # pull edits made in Foundry back to packs-src/
npm run validate        # pre-flight checks on the pack sources
npm run lint
```

To release: add a `## X.Y.Z — date` section to `CHANGELOG.md` (the release notes come from it), bump `module.json`, then tag and push `vX.Y.Z`.

## Copyright

*Shadowrun* is © FASA and its rights holders. Fan-made and non-commercial.
