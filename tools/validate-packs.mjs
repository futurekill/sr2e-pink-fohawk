#!/usr/bin/env node
/**
 * Assert the things about this module that would otherwise rot silently:
 * chargen arithmetic, Essence/Body Index ceilings, and art that actually
 * exists on disk. Run after `npm run gen` and before `npm run build-packs`.
 *
 * Deliberately narrow. It checks facts that a regenerated actor could break
 * without anyone noticing until a session — not every field in the schema.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SR2E } from "../../sr2e-foundryvtt/module/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const dir = join(ROOT, "packs-src", "pf-actors");
const files = readdirSync(dir).filter(f => f.endsWith(".json"));
check(files.length > 0, "pf-actors has no documents");

for (const f of files) {
  const a = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const s = a.system, items = a.items ?? [], of = t => items.filter(i => i.type === t);
  const tag = a.name ?? f;

  // Ids must be unique — itemId() folds a counter into a hash that gets
  // truncated to 16 chars, so a collision is a real possibility, not paranoia.
  const ids = items.map(i => i._id);
  check(new Set(ids).size === ids.length, `${tag}: duplicate embedded item ids`);
  check(/^[A-Za-z0-9]{16}$/.test(a._id), `${tag}: actor _id is not a 16-char id`);

  // Art must exist. A regenerated actor that points at a missing portrait
  // renders a blank token and nobody notices until the map is live.
  for (const [what, p] of [["portrait", a.img], ["token", a.prototypeToken?.texture?.src]]) {
    if (!p || p.startsWith("icons/")) continue;          // Foundry core art is fine
    const rel = p.replace(/^modules\/sr2e-pink-fohawk\//, "");
    check(existsSync(join(ROOT, rel)), `${tag}: ${what} art missing on disk — ${p}`);
  }

  // Chargen: attribute points bought must match the chosen priority exactly.
  const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
  const spent = ATTRS.reduce((n, k) => n + (s[k]?.base ?? 0), 0);
  const budget = SR2E.priorities[s.chargen?.priorities?.attributes]?.attributes;
  check(budget !== undefined, `${tag}: unknown attribute priority`);
  check(spent === budget, `${tag}: spent ${spent} attribute points, priority allows ${budget}`);

  // Essence and Body Index ceilings (Shadowtech: BI cap = unaugmented Body).
  const essence = of("cyberware").filter(i => i.system.installed)
    .reduce((n, i) => n + (i.system.essenceCost ?? 0), 0);
  check(essence <= 6, `${tag}: cyberware costs ${essence.toFixed(2)} Essence, only 6 exist`);

  const bi = of("bioware").filter(i => i.system.installed)
    .reduce((n, i) => n + (i.system.bodyCost ?? i.system.actualBodyCost ?? 0), 0);
  const naturalBody = (s.body?.base ?? 0) + (s.body?.racial ?? 0);
  check(bi <= naturalBody,
    `${tag}: Body Index ${bi.toFixed(2)} exceeds unaugmented Body ${naturalBody}`);

  check((s.nuyen ?? 0) >= 0, `${tag}: negative nuyen (${s.nuyen}) — gear overspent`);
  check(items.every(i => i.name?.trim()), `${tag}: an embedded item has a blank name`);
}

if (fails.length) {
  console.error(`validate-packs FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`validate-packs OK — ${files.length} document(s)`);
