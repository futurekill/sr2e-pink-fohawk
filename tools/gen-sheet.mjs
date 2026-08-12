#!/usr/bin/env node
/**
 * Render a printable SR2-styled character sheet (SVG -> PDF) from the actual
 * compendium actor, so the sheet cannot drift from what Foundry loads.
 *
 *   node tools/gen-sheet.mjs            # writes dist/mel-offaleater-sheet.{svg,pdf}
 *
 * Derived values (Reaction, Combat Pool, armour) are computed with the SYSTEM's
 * own exported helpers rather than retyped — if a rule changes upstream, this
 * sheet changes with it. The augmentation attribute maths mirrors
 * CharacterData#_calculateAttributeMods: cyberware mods are absolute, bioware
 * mods are per-Level and scale by Rating (Shadowtech).
 *
 * Renderer: rsvg-convert. ImageMagick cannot draw SVG <text> (no fontconfig),
 * and librsvg reading from STDIN has no base URI, so the SVG must be written to
 * a file next to the portrait for the relative <image href> to resolve.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  reactionBase, heavyArmorPoolPenalty, wornArmorTotals
} from "../../sr2e-foundryvtt/module/rules/sr2e-rules.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT  = join(ROOT, "dist");

// ---------------------------------------------------------------- load actor
const packDir = join(ROOT, "packs-src", "pf-actors");
const file = readdirSync(packDir).find(f => f.endsWith(".json"));
const actor = JSON.parse(readFileSync(join(packDir, file), "utf8"));
const sys = actor.system;
const items = actor.items;
const of = t => items.filter(i => i.type === t);
const strip = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------- derive (as the model)
const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const mods = Object.fromEntries([...ATTRS, "reaction", "initiativeDice"].map(k => [k, 0]));
let exemptQuickness = 0, essenceUsed = 0, bodyIndexUsed = 0, unarmedPower = 0;

for (const i of items) {
  const s = i.system ?? {};
  if (!(i.type === "cyberware" || i.type === "bioware") || !s.installed) continue;
  // Bioware attribute mods are per-Level; cyberware values are absolute.
  const scale = i.type === "bioware" ? Math.max(1, s.rating ?? 1) : 1;
  for (const [k, v] of Object.entries(s.attributeMods ?? {})) {
    if (k in mods) mods[k] += (v || 0) * scale;
  }
  if (s.noReactionBonus) exemptQuickness += (s.attributeMods?.quickness || 0) * scale;
  if (i.type === "cyberware") essenceUsed += s.essenceCost ?? 0;
  else bodyIndexUsed += s.bodyCost ?? s.actualBodyCost ?? 0;
  unarmedPower = Math.max(unarmedPower, s.unarmedPowerBonus || 0);
}

// Attribute Edges (Companion): Bonus Attribute Point adds a point, Exceptional
// Attribute raises the racial ceiling that point would otherwise be clipped by.
const edgeBonus = {}, edgeMax = {};
for (const q of of("quality")) {
  const a = q.system?.attribute;
  if (!a) continue;
  edgeBonus[a] = (edgeBonus[a] ?? 0) + (q.system.attributeBonus || 0);
  edgeMax[a]   = (edgeMax[a]   ?? 0) + (q.system.maximumBonus  || 0);
}

const A = {};
for (const k of ATTRS) {
  const nat = sys[k].base + sys[k].racial + (edgeBonus[k] ?? 0);
  A[k] = { natural: nat, value: Math.max(1, nat + mods[k]) };
}

const react = reactionBase(A.quickness.value, A.intelligence.value, exemptQuickness);
const reaction = react + mods.reaction;
const initDice = Math.max(1, 1 + mods.initiativeDice);

const armorItems = of("armor").filter(i => i.system.equipped);
const worn = wornArmorTotals(armorItems);
let implantB = 0, implantI = 0;
for (const i of items) {
  if ((i.type === "bioware" || i.type === "cyberware") && i.system.installed) {
    implantB += i.system.armorBallistic ?? 0;
    implantI += i.system.armorImpact ?? 0;
  }
}
const armor = { b: worn.ballistic + implantB, i: worn.impact + implantI };
const heavyPen = heavyArmorPoolPenalty(A.quickness.value, armorItems);
const combatPool = Math.max(0, Math.floor(
  (A.quickness.value + A.intelligence.value + A.willpower.value) / 2) - heavyPen);

// Melee damage codes, from the items' own printed formulas.
const spur = of("cyberware").find(i => i.system.damageCode?.includes("Str"));
const spurPower = A.strength.value + 2;                       // (Str+2)L, p.246
const fistPower = A.strength.value + unarmedPower;            // (Str+3)M, Shadowtech p.42

// ------------------------------------------------------------------- palette
const PAPER = "#f3f3f4", INK = "#0e0e10", ACCENT = "#d6006e";
const RULE = "#c2c2c8", MUTED = "#54545c";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const F = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;
const out = [];
const p = (...s) => out.push(...s);

/** A section header: solid ink bar with a clipped corner and paper lettering. */
function band(x, y, w, label) {
  const h = 15, cut = 7;
  p(`<path d="M${x} ${y} H${x + w - cut} L${x + w} ${y + cut} V${y + h} H${x} Z" fill="${INK}"/>`,
    `<text x="${x + 7}" y="${y + 11}" ${F} font-size="8.5" font-weight="700" `
    + `letter-spacing="1.6" fill="${PAPER}">${esc(label.toUpperCase())}</text>`);
  return y + h;
}
/** Small field label above a value. */
function label(x, y, t, anchor = "start") {
  p(`<text x="${x}" y="${y}" ${F} font-size="6.2" font-weight="600" letter-spacing="1.1" `
    + `fill="${MUTED}" text-anchor="${anchor}">${esc(t.toUpperCase())}</text>`);
}
function val(x, y, t, size = 12, anchor = "start", fill = INK, weight = 700) {
  p(`<text x="${x}" y="${y}" ${F} font-size="${size}" font-weight="${weight}" `
    + `fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`);
}
function rule(x, y, w, colour = RULE) {
  p(`<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${colour}" stroke-width="0.5"/>`);
}
/** Greedy wrap at an approximate glyph width — good enough for a fixed sheet. */
function wrap(text, chars) {
  const words = String(text).split(/\s+/), lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > chars) { lines.push(line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
/**
 * Wrap, then cut back to the last COMPLETE sentence that fits. A character
 * sheet that stops mid-clause looks broken; stopping on a full stop reads as
 * an excerpt, which is what it is.
 */
function wrapTo(text, chars, maxLines) {
  const lines = wrap(text, chars);
  // Clamp: a negative budget would make slice() count from the END and spill
  // the whole block past the footer instead of truncating it.
  const cap = Math.max(1, Math.floor(maxLines));
  if (lines.length <= cap) return lines;
  // Cut the SOURCE text at the last sentence end that still fits the budget —
  // trimming whole wrapped LINES almost never lands on a full stop.
  const budget = lines.slice(0, cap).join(" ").length;
  const head = text.slice(0, budget);
  const cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "),
                       head.lastIndexOf("? "));
  const trimmed = cut > chars ? text.slice(0, cut + 1) : head.trim() + "…";
  return wrap(trimmed, chars).slice(0, cap);
}

const W = 612, H = 792, M = 30, CW = W - M * 2;
p(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
  ` width="8.5in" height="11in" viewBox="0 0 ${W} ${H}">`,
  `<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

// ------------------------------------------------------------------- header
const HH = 88;
p(`<path d="M${M} ${M} H${W - M} V${M + HH - 12} L${W - M - 12} ${M + HH} H${M} Z" fill="${INK}"/>`,
  `<clipPath id="pc"><rect x="${M + 7}" y="${M + 7}" width="74" height="74"/></clipPath>`,
  `<image xlink:href="assets/portraits/mel-offaleater.png" x="${M + 7}" y="${M + 7}" `
  + `width="74" height="74" preserveAspectRatio="xMidYMin slice" clip-path="url(#pc)"/>`);

val(M + 96, M + 38, actor.name, 25, "start", PAPER);
p(`<text x="${M + 96}" y="${M + 55}" ${F} font-size="8" font-weight="700" letter-spacing="2.4" `
  + `fill="${ACCENT}">TROLL &#183; STREET SAMURAI &#183; MELEE</text>`);
const tagline = "Lives in a cave. Comes into town when someone needs a door removed.";
p(`<text x="${M + 96}" y="${M + 72}" ${F} font-size="7.6" fill="#9a9aa2" `
  + `font-style="italic">${esc(tagline)}</text>`);

// priorities, right-aligned inside the header
const pri = sys.chargen.priorities;
const priCells = [["race", pri.race], ["attr", pri.attributes], ["res", pri.resources],
                  ["skills", pri.skills], ["magic", pri.magic]];
priCells.forEach(([k, v], n) => {
  const x = W - M - 12 - (priCells.length - n) * 28;
  p(`<text x="${x + 10}" y="${M + 24}" ${F} font-size="5.8" font-weight="600" letter-spacing="0.8" `
    + `fill="#8a8a92" text-anchor="middle">${esc(k.toUpperCase())}</text>`);
  p(`<text x="${x + 10}" y="${M + 38}" ${F} font-size="13" font-weight="700" `
    + `fill="${v === "A" ? ACCENT : PAPER}" text-anchor="middle">${esc(v)}</text>`);
});

// --------------------------------------------------------------- attributes
let y = M + HH + 16;
y = band(M, y, CW, "attributes");
const boxW = CW / 6;
y += 6;
ATTRS.forEach((k, n) => {
  const x = M + n * boxW, cx = x + boxW / 2;
  const aug = A[k].value !== A[k].natural;
  label(cx, y + 8, k.slice(0, 3), "middle");
  val(cx, y + 31, String(A[k].value), 22, "middle", aug ? ACCENT : INK);
  p(`<text x="${cx}" y="${y + 41}" ${F} font-size="6" fill="${MUTED}" text-anchor="middle">`
    + `nat ${A[k].natural}</text>`);
  if (n) p(`<line x1="${x}" y1="${y + 2}" x2="${x}" y2="${y + 44}" stroke="${RULE}" stroke-width="0.5"/>`);
});
y += 52;

// derived strip
rule(M, y - 5, CW);
const derived = [
  ["reaction", String(reaction)],
  ["initiative", `${reaction} + ${initDice}D6`],
  ["combat pool", String(combatPool)],
  ["karma pool", String(sys.karma.pool)],
  ["essence", (6 - essenceUsed).toFixed(2)],
  ["body index", `${bodyIndexUsed.toFixed(2)} / ${A.body.natural}`],
  ["armour", `${armor.b} / ${armor.i}`]
];
const dW = CW / derived.length;
derived.forEach(([k, v], n) => {
  const cx = M + n * dW + dW / 2;
  label(cx, y + 8, k, "middle");
  val(cx, y + 24, v, 12.5, "middle");
  if (n) p(`<line x1="${M + n * dW}" y1="${y - 1}" x2="${M + n * dW}" y2="${y + 28}" `
    + `stroke="${RULE}" stroke-width="0.5"/>`);
});
y += 36;

// ------------------------------------------------ two columns: skills | combat
const COLW = (CW - 14) / 2, RX = M + COLW + 14;
let ly = y, ry = y;

ly = band(M, ly, COLW, "skills");
ly += 12;
for (const s of of("skill")) {
  // Concentration/specialization are {name, rating} sub-objects, not strings.
  const sub = [s.system.specialization, s.system.concentration].find(x => x?.name);
  val(M + 2, ly, s.name, 8.5, "start", INK, 600);
  if (sub) p(`<text x="${M + 2 + s.name.length * 4.7 + 6}" y="${ly}" ${F} font-size="6.6" `
    + `fill="${MUTED}">${esc(sub.name)} ${sub.rating}</text>`);
  val(M + COLW - 2, ly, String(s.system.rating), 11, "end", ACCENT);
  rule(M, ly + 4, COLW, "#e2e2e6");
  ly += 13;
}

ly += 8;
ly = band(M, ly, COLW, "edges & flaws");
ly += 12;
for (const q of of("quality")) {
  val(M + 2, ly, q.name, 8, "start", INK, 600);
  ly += 12;
}

// Running him at the table — the left column has the room and a GM handing
// this to a player should not have to reverse-engineer the build.
ly += 8;
ly = band(M, ly, COLW, "running him");
ly += 12;
const tactics = [
  `Two actions most turns. Spend the first closing — everything he is good at `
  + `happens inside one metre, and Reach +1 means he swings first.`,
  `Fists are the default: ${fistPower}M Stun drops people without killing them. `
  + `The spurs (${spurPower}L Physical) mean he has decided.`,
  `Intelligence ${A.intelligence.value}, Willpower ${A.willpower.value} — he `
  + `misses things and resists spells badly. He is the hammer, not the eyes. `
  + `And he cannot read: hand him a picture, or nothing.`
];
for (const t of tactics) {
  for (const line of wrap(t, 60)) {
    p(`<text x="${M + 2}" y="${ly}" ${F} font-size="6.6" fill="${INK}">${esc(line)}</text>`);
    ly += 8.6;
  }
  ly += 3;
}

// right column — the parts you actually reach for mid-fight
ry = band(RX, ry, COLW, "condition monitor");
ry += 10;
for (const [name, track] of [["physical", sys.conditionMonitor.physical],
                            ["stun", sys.conditionMonitor.stun]]) {
  label(RX, ry + 6, name);
  const bw = 12, gap = 2.6, x0 = RX + 54;
  for (let n = 0; n < 10; n++) {
    const bx = x0 + n * (bw + gap);
    // Wound levels: Light at 1, Moderate at 3, Serious at 6, Deadly at 10 (p.112)
    const mark = { 0: "L", 2: "M", 5: "S", 9: "D" }[n];
    p(`<rect x="${bx}" y="${ry - 3}" width="${bw}" height="${bw}" fill="none" `
      + `stroke="${mark ? INK : RULE}" stroke-width="${mark ? 1 : 0.6}"/>`);
    if (mark) p(`<text x="${bx + bw / 2}" y="${ry + 14}" ${F} font-size="5.4" font-weight="700" `
      + `fill="${MUTED}" text-anchor="middle">${mark}</text>`);
  }
  ry += 26;
}
ry += 4;
p(`<text x="${RX}" y="${ry}" ${F} font-size="6.6" fill="${MUTED}">`
  + `Damage Resistance: ${A.body.value} Body + 1 troll Dermal Armour = `
  + `<tspan font-weight="700" fill="${INK}">${A.body.value + 1} dice</tspan></text>`);
ry += 16;

ry = band(RX, ry, COLW, "attacks");
ry += 12;
const attacks = [
  ["Fist (bone lacing)", `${fistPower}M Stun`, "Unarmed 6"],
  ["Fist — physical", `${Math.ceil(fistPower / 2)}M Physical`, "half Power, p.42"],
  [spur ? spur.name + "s" : "Spur", `${spurPower}L Physical`, "Armed 7"],
  ["Reach", "+1 (troll)", "opposed melee"]
];
for (const [n, dmg, note] of attacks) {
  val(RX + 2, ry, n, 8, "start", INK, 600);
  val(RX + COLW - 2, ry, dmg, 9, "end", ACCENT);
  p(`<text x="${RX + 2}" y="${ry + 9}" ${F} font-size="6.2" fill="${MUTED}">${esc(note)}</text>`);
  rule(RX, ry + 13, COLW, "#e2e2e6");
  ry += 24;
}

ry += 4;
ry = band(RX, ry, COLW, "worn armour");
ry += 12;
for (const a of of("armor")) {
  val(RX + 2, ry, a.name, 8, "start", INK, 600);
  val(RX + COLW - 2, ry, `${a.system.ballistic}/${a.system.impact}`, 9, "end");
  ry += 11;
  if (a.system.heavyArmor) {
    p(`<text x="${RX + 2}" y="${ry}" ${F} font-size="6.2" fill="${ACCENT}">`
      + `Heavy armour: ${a.system.ballistic} Ballistic − ${A.quickness.value} `
      + `Quickness = ${heavyPen} Combat Pool ${heavyPen === 1 ? "die" : "dice"} `
      + `lost (p.84)</text>`);
    ry += 11;
  }
}
p(`<text x="${RX + 2}" y="${ry}" ${F} font-size="6.4" fill="${MUTED}">`
  + `+ ${implantB}/${implantI} implant armour (titanium lacing), cumulative</text>`);
ry += 12;

// ------------------------------------------------------ augmentations, full width
y = Math.max(ly, ry) + 12;
y = band(M, y, CW, `cyberware & bioware — essence ${essenceUsed.toFixed(2)}`
  + ` / body index ${bodyIndexUsed.toFixed(2)}`);
y += 12;
const augs = [...of("cyberware"), ...of("bioware")];
const half = Math.ceil(augs.length / 2);
augs.forEach((a, n) => {
  const col = n < half ? 0 : 1;
  const x = M + col * (COLW + 14), ay = y + (n % half) * 13;
  const cost = a.type === "cyberware"
    ? `${(a.system.essenceCost ?? 0).toFixed(2)} E`
    : `${(a.system.bodyCost ?? a.system.actualBodyCost ?? 0).toFixed(2)} BI`;
  val(x + 2, ay, a.name, 8, "start", INK, 600);
  val(x + COLW - 2, ay, cost, 7.4, "end", MUTED, 600);
  rule(x, ay + 4, COLW, "#e6e6ea");
});
y += half * 13 + 10;

// ------------------------------------------------------------ contact + notes
// Both prose blocks run to the footer, so their line budget is whatever space
// is actually left rather than a guessed constant.
const FOOT_Y = H - M - 16;
const contact = of("contact")[0];
let cy = band(M, y, COLW, "contacts");
cy += 12;
if (contact) {
  val(M + 2, cy, contact.name, 9, "start", INK, 700);
  val(M + COLW - 2, cy, `L${contact.system.loyalty} / I${contact.system.influence}`, 8, "end", ACCENT);
  cy += 10;
  p(`<text x="${M + 2}" y="${cy}" ${F} font-size="6.6" fill="${MUTED}">`
    + `${esc(contact.system.archetype)} — his niece</text>`);
  cy += 11;
  for (const line of wrapTo(strip(contact.system.description), 62,
                            Math.floor((FOOT_Y - 8 - cy) / 8.6))) {
    p(`<text x="${M + 2}" y="${cy}" ${F} font-size="6.6" fill="${INK}">${esc(line)}</text>`);
    cy += 8.6;
  }
}

let ny = band(RX, y, COLW, "the character");
ny += 12;
for (const line of wrapTo(strip(sys.biography), 62,
                          Math.floor((FOOT_Y - 8 - ny) / 8.6))) {
  p(`<text x="${RX + 2}" y="${ny}" ${F} font-size="6.6" fill="${INK}">${esc(line)}</text>`);
  ny += 8.6;
}

// ------------------------------------------------------------------- footer
const fy = FOOT_Y;
p(`<path d="M${M} ${fy} H${W - M} V${fy + 16} H${M + 12} L${M} ${fy + 4} Z" fill="${INK}"/>`);
const foot = [
  ["nuyen", `${sys.nuyen.toLocaleString("en-US")}¥`],
  ["karma earned", String(sys.karma.total)],
  ["karma pool", String(sys.karma.pool)],
  ["essence left", (6 - essenceUsed).toFixed(2)]
];
foot.forEach(([k, v], n) => {
  const x = M + 14 + n * 102;
  p(`<text x="${x}" y="${fy + 11}" ${F} font-size="6.2" font-weight="600" letter-spacing="1" `
    + `fill="#8a8a92">${esc(k.toUpperCase())}</text>`,
    `<text x="${x + 62}" y="${fy + 11.5}" ${F} font-size="9" font-weight="700" `
    + `fill="${PAPER}">${esc(v)}</text>`);
});
p(`<text x="${W - M - 8}" y="${fy + 11}" ${F} font-size="6" letter-spacing="0.8" `
  + `fill="#8a8a92" text-anchor="end">PINK FOHAWK</text>`);

p(`</svg>`);

// -------------------------------------------------------------------- render
mkdirSync(OUT, { recursive: true });
// librsvg resolves relative hrefs against the FILE's directory, so the SVG has
// to sit at the repo root next to assets/ — not in dist/, and never on stdin.
const svgPath = join(ROOT, ".sheet.svg");
writeFileSync(svgPath, out.join("\n"));
const pdf = join(OUT, "mel-offaleater-sheet.pdf");
const png = join(OUT, "mel-offaleater-sheet.png");
execFileSync("rsvg-convert", ["-f", "pdf", "-o", pdf, svgPath]);
execFileSync("rsvg-convert", ["-f", "png", "--zoom", "2", "-o", png, svgPath]);
writeFileSync(join(OUT, "mel-offaleater-sheet.svg"), out.join("\n"));

console.log(`Sheet: ${relative(ROOT, pdf)} + .png/.svg`);
console.log(`  Body ${A.body.value}  Quickness ${A.quickness.value}  Strength ${A.strength.value}`
  + `  Charisma ${A.charisma.value}  Intelligence ${A.intelligence.value}`
  + `  Willpower ${A.willpower.value}`);
console.log(`  Reaction ${reaction} (base ${react}, ${exemptQuickness} Quickness exempt)`
  + ` | Init ${reaction}+${initDice}D6 | Combat Pool ${combatPool} (heavy −${heavyPen})`
  + ` | Armour ${armor.b}/${armor.i}`);
