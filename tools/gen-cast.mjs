// Build the Pink Fohawk cast into packs-src/pf-actors.
//
// Every implant, weapon and piece of armour is READ OUT OF THE REAL COMPENDIA —
// the sr2e system's packs and sr2e-shadowtech's — never re-typed here. Mel's
// sheet therefore carries the same Essence costs, damage codes and attribute
// mods that the rest of the estate uses, and a correction to a source item
// reaches him on the next run.
//
// That matters more than it sounds: hand-copying a stat block is exactly how
// Queen Euphoria ended up shipping twelve invented NPCs.
//
// Portrait paths are derived here, not stamped as placeholders, so a re-run
// cannot silently un-wire the art (the sr2e-rigger-black-book failure mode).
import { writeFileSync, readdirSync, readFileSync, mkdirSync, rmSync, renameSync, existsSync }
  from "node:fs";

const SYS  = "../sr2e-foundryvtt";
const TECH = "../sr2e-shadowtech";
const DIR  = "packs-src/pf-actors";

/** Index every document in a pack directory by name. */
function loadPack(root, name) {
  const dir = `${root}/packs-src/${name}`;
  const map = new Map();
  for (const f of readdirSync(dir).filter(f => f.endsWith(".json") && !f.startsWith("_folder"))) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    if (d.name) map.set(d.name, d);
  }
  return map;
}
/** Every Shadowtech pack merged — its bioware/cyberware split varies by pack name. */
function loadAll(root) {
  const map = new Map();
  for (const pack of readdirSync(`${root}/packs-src`)) {
    try { for (const [k, v] of loadPack(root, pack)) map.set(k, v); } catch { /* not a dir */ }
  }
  return map;
}
const SYS_ITEMS  = loadAll(SYS);
const TECH_ITEMS = loadAll(TECH);

function findItem(name) {
  const d = SYS_ITEMS.get(name) ?? TECH_ITEMS.get(name);
  if (!d) throw new Error(`No compendium item named "${name}" in ${SYS} or ${TECH}`);
  return d;
}

const STATS = { coreVersion: "13.351", systemId: "sr2e", systemVersion: "0.89.0",
  createdTime: 1785000000000, modifiedTime: 1785000000000, lastModifiedBy: null,
  compendiumSource: null, duplicateSource: null, exportSource: null };

// Deterministic, and unique even when the same item appears twice (Mel carries
// two Retractable Spurs).
//
// The counter goes in the PREFIX, not the suffix. An earlier version appended
// "#1" to the NAME and re-hashed — but the id is truncated to 16 characters and
// the suffix only changed the hash beyond that cut, so the id never actually
// differed and the de-dupe loop spun forever.
let seq = 0;
function itemId(aid, name) {
  const n = (seq++).toString(16).padStart(2, "0");
  return (aid.slice(0, 4) + n + Buffer.from(name).toString("hex"))
    .slice(0, 16).padEnd(16, "0");
}

const attr = (base, racial) => ({ base, mod: 0, value: base + racial, racial });

/**
 * Pull a compendium item, install it, and give it an id unique to this actor.
 * `rating` selects from ratingStats for rated items (Muscle Augmentation etc.),
 * whose top-level cost/bodyCost are placeholders.
 */
function implant(aid, name, { rating = null, installed = true, equipped = true } = {}) {
  const src = findItem(name);
  const sys = foundryClone(src.system);
  if (rating !== null) {
    const row = (sys.ratingStats ?? []).find(r => r.rating === rating);
    if (!row) throw new Error(`"${name}" has no ratingStats row for rating ${rating}`);
    Object.assign(sys, { rating, cost: row.cost, bodyCost: row.bodyCost,
                         essenceCost: row.essenceCost ?? sys.essenceCost,
                         availability: row.availability ?? sys.availability,
                         streetIndex: row.streetIndex ?? sys.streetIndex });
  }
  if ("installed" in sys) sys.installed = installed;
  if ("equipped" in sys)  sys.equipped  = equipped;
  return {
    _id: itemId(aid, name + (rating ?? "")), name: rating ? `${name} (Level ${rating})` : src.name,
    type: src.type, img: src.img, system: sys,
    effects: [], flags: {}, _stats: STATS, folder: null, sort: 0, ownership: { default: 0 }
  };
}
const foundryClone = (o) => JSON.parse(JSON.stringify(o));

function skill(aid, name, rating, opts = {}) {
  return {
    _id: itemId(aid, "skill:" + name), name, type: "skill", img: "icons/svg/book.svg",
    system: { category: opts.category ?? "active", linkedAttribute: opts.attr ?? "strength",
      rating, concentration: { name: opts.conc ?? "", rating: opts.conc ? rating : 0 },
      specialization: { name: "", rating: 0 }, isMagical: false, notes: opts.notes ?? "" },
    effects: [], flags: {}, _stats: STATS, folder: null, sort: 0, ownership: { default: 0 }
  };
}

function quality(aid, q) {
  return {
    _id: itemId(aid, "q:" + q.name), name: q.name, type: "quality", img: "icons/svg/upgrade.svg",
    system: { kind: q.kind, category: q.category, pointValue: q.pointValue,
      attribute: q.attribute ?? "", attributeBonus: q.attributeBonus ?? 0,
      maximumBonus: q.maximumBonus ?? 0, source: q.source ?? "", notes: q.notes ?? "" },
    effects: [], flags: {}, _stats: STATS, folder: null, sort: 0, ownership: { default: 0 }
  };
}

function contact(aid, c) {
  return {
    _id: itemId(aid, "c:" + c.name), name: c.name, type: "contact", img: "icons/svg/village.svg",
    system: { contactType: "contact", archetype: c.archetype, loyalty: c.loyalty,
      influence: c.influence, description: c.description, notes: c.notes ?? "" },
    effects: [], flags: {}, _stats: STATS, folder: null, sort: 0, ownership: { default: 0 }
  };
}

// ── MEL ──────────────────────────────────────────────────────────────────────
// Foundry document ids are EXACTLY 16 alphanumeric characters — a short id is
// accepted by the pack builder and then misbehaves in the world.
const MEL_ID = "melofflea7e70011";
const IMG = "modules/sr2e-pink-fohawk/assets/portraits/mel-offaleater.webp";
if (!existsSync("assets/portraits/mel-offaleater.webp")) {
  throw new Error("Mel's portrait is missing — refusing to ship him on a placeholder icon.");
}

// Troll racial modifiers, from the sr2e Races compendium rather than retyped.
const TROLL = findItem("Troll").system.attributeMods;

const melItems = [
  // --- Cyberware: 2.25 + 0.6 + 3.0 = 5.85 Essence, leaving 0.15 -------------
  implant(MEL_ID, "Bone Lacing (Titanium)"),
  implant(MEL_ID, "Retractable Spur"),
  implant(MEL_ID, "Retractable Spur"),
  implant(MEL_ID, "Wired Reflexes (Level 2)"),
  // --- Bioware: Body Index 5.45 against a cap of 11 (his natural Body) ------
  // Muscle Augmentation is why the Essence above is affordable: it buys +4
  // Strength and +4 Quickness out of Body Index instead.
  implant(MEL_ID, "Muscle Augmentation", { rating: 4 }),
  implant(MEL_ID, "Suprathyroid Gland"),
  implant(MEL_ID, "Enhanced Articulation"),
  implant(MEL_ID, "Reflex Recorder (General)"),
  // --- Worn ----------------------------------------------------------------
  // Heavy: the pool penalty is (ballistic − Quickness), and Quickness 7 leaves
  // only 1. His speed is what lets him wear this.
  implant(MEL_ID, "Full Heavy Armor"),

  // --- Skills: 20 points at chargen, then 30 Karma -------------------------
  skill(MEL_ID, "Armed Combat", 7, { attr: "strength", notes: "6 at creation, raised to 7 with Karma (7 × 2 = 14)." }),
  skill(MEL_ID, "Unarmed Combat", 6, { attr: "strength", notes: "5 at creation, raised to 6 with Karma (6 × 2 = 12)." }),
  skill(MEL_ID, "Athletics", 3, { attr: "body" }),
  skill(MEL_ID, "Intimidation", 3, { attr: "charisma" }),
  skill(MEL_ID, "Etiquette", 2, { attr: "charisma", conc: "Street" }),
  skill(MEL_ID, "Firearms", 2, { attr: "quickness", notes: "1 at creation, raised to 2 with Karma (2 × 2 = 4). He can shoot. He would rather not." }),
  skill(MEL_ID, "Comic Book Trivia", 4, { category: "knowledge", attr: "intelligence",
    notes: "Entirely visual. He cannot read a word of any of them." }),

  // --- Edges & flaws: 3 points each way, balanced --------------------------
  quality(MEL_ID, { name: "Illiterate", kind: "flaw", category: "mental", pointValue: -1,
    source: "Shadowrun Companion",
    notes: "Cannot read. Cannot take most Technical or Knowledge skills, and relies on others to translate." }),
  quality(MEL_ID, { name: "Oblivious", kind: "flaw", category: "mental", pointValue: -2,
    source: "Shadowrun Companion",
    notes: "Takes things at face value. Believes the X-Men films were documentaries, and will argue the point." }),
  quality(MEL_ID, { name: "Exceptional Attribute (Strength)", kind: "edge", category: "attribute",
    pointValue: 2, attribute: "strength", maximumBonus: 1, source: "Shadowrun Companion",
    notes: "Raises the troll Strength maximum from 10 to 11. Raises the ceiling only — the point itself is bought below." }),
  quality(MEL_ID, { name: "Bonus Attribute Point (Strength)", kind: "edge", category: "attribute",
    pointValue: 1, attribute: "strength", attributeBonus: 1, source: "Shadowrun Companion",
    notes: "Actually reaches the raised maximum. Counts as natural Strength." }),

  // --- Contact -------------------------------------------------------------
  contact(MEL_ID, { name: "Tina Bonemeal", archetype: "Surveillance Specialist",
    loyalty: 6, influence: 3,
    description: "<p><strong>His niece.</strong> Nine and a half feet of troll muscle — which is to say a perfectly ordinary size for a troll, and a head shorter than her uncle. Expert in surveillance: she will sit on a building for eleven hours and tell you precisely who came and went.</p>"
      + "<p>Completely socially inept, and desperate to be an actress. She can tell you everything about a person except how to talk to one.</p>"
      + "<p><strong>Mel believes she has already made it.</strong> He cannot read a script, a review or a casting call, so he simply takes her word and repeats it to strangers at length. If she ever books a role he will look at the poster for hours, because looking at pictures is the part he can do.</p>"
      + "<p><em>Loyalty 6 — family. She does not charge him.</em></p>" })
];

const mel = {
  _id: MEL_ID, name: "Melvin \"Mel\" Offaleater", type: "character", img: IMG,
  system: {
    biography:
      "<p><strong>Old.</strong> Old enough that most trolls his age are dead or settled, and he is neither. Mel lives alone in a comfortable cave a long way from any sprawl, comes into the city when someone needs a door removed, and goes home again.</p>"
      + "<p>Well over three metres — enormous even by troll standards, and used to not fitting through things. Warm sandstone hide covered in dermal denticles that rasp like a cat's tongue. Knobbly coral-like keratin growths burst through the knees of every pair of trousers he has ever owned, and cap both elbows. One horn snapped off years ago and is capped with a bolted steel plate he had fitted himself.</p>"
      + "<p><strong>He is a sweetheart, and he does not look like one.</strong> The face is broken-nosed, scarred and utterly still, and people cross the street. What they are missing is the battered comic book in his chest pocket, which he cannot read and looks at anyway.</p>"
      + "<p><strong>In a fight he is a different animal entirely.</strong> Reaction 10 on three dice means he acts twice while most of the room acts once, and he closes the distance on the first pass. The fists are the default — 19M Stun puts people down without killing them. The spurs come out when he means it.</p>"
      + "<p><em>Uncle to Tina Bonemeal. He is her most sincere and least useful supporter.</em></p>",
    race: "troll",
    // 24 attribute points at Priority B: 6/3/6/3/4/2
    body:         attr(6, TROLL.body),
    quickness:    attr(3, TROLL.quickness),
    strength:     attr(6, TROLL.strength),
    charisma:     attr(3, TROLL.charisma),
    intelligence: attr(4, TROLL.intelligence),
    willpower:    attr(2, TROLL.willpower),
    essence: { value: 6, max: 6 },          // derived down by installed cyberware
    bodyIndex: { value: 5.45, max: 11 },    // cap is his UNAUGMENTED Body
    magic: { value: 0, max: 0, tradition: "none", type: "none", totem: "" },
    karma: { current: 0, total: 30, pool: 4 },   // 30 earned, 30 spent; pool = ceil(30/10) + 1
    nuyen: 12000,
    conditionMonitor: { physical: { value: 0, max: 10, overflow: 0 },
                        stun: { value: 0, max: 10, overflow: 0 }, overflow: 0 },
    armor: { ballistic: 0, impact: 0 },     // worn + racial + lacing are derived
    dicePools: { combat: { value: 0, max: 0, bonus: 0 },
                 magic: { value: 0, max: 0, bonus: 0 },
                 control: { value: 0, max: 0, bonus: 0 },
                 hacking: { value: 0, max: 0, bonus: 0 },
                 spellDefense: 0, shieldingBonus: 0 },
    chargen: { inProgress: false, priorities: { race: "A", attributes: "B", resources: "C", skills: "D", magic: "E" } }
  },
  items: melItems, effects: [], folder: null, sort: 0, flags: {},
  _stats: STATS,
  prototypeToken: {
    name: "Mel", displayName: 20, actorLink: true,
    // 2x2. At 100px/cell = 1 metre he is over three metres across the shoulders;
    // a 1x1 token would make him the same size as a human on every battlemap.
    width: 2, height: 2,
    texture: { src: IMG, anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0,
      fit: "cover", scaleX: 1, scaleY: 1, rotation: 0, tint: "#ffffff", alphaThreshold: 0.75 },
    lockRotation: true, rotation: 0, alpha: 1, disposition: 1, displayBars: 20,
    bar1: { attribute: "conditionMonitor.physical" }, bar2: { attribute: "conditionMonitor.stun" }
  },
  ownership: { default: 0 }, _key: `!actors!${MEL_ID}`
};

// ── emit (atomic) ────────────────────────────────────────────────────────────
const CAST = [mel];
const TMP = `${DIR}.tmp-${process.pid}`, BAK = `${DIR}.bak-${process.pid}`;
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
try {
  for (const a of CAST) {
    const file = a.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    writeFileSync(`${TMP}/${file}_${a._id}.json`, JSON.stringify(a, null, 2) + "\n");
  }
  if (readdirSync(TMP).length !== CAST.length) throw new Error("file count mismatch");
  if (existsSync(DIR)) renameSync(DIR, BAK);
  try { renameSync(TMP, DIR); }
  catch (e) { if (existsSync(BAK)) renameSync(BAK, DIR); throw e; }
  rmSync(BAK, { recursive: true, force: true });
} catch (e) {
  rmSync(TMP, { recursive: true, force: true });
  if (existsSync(BAK) && !existsSync(DIR)) renameSync(BAK, DIR);
  throw e;
}

for (const a of CAST) {
  const ess = a.items.filter(i => i.system.essenceCost)
    .reduce((s, i) => s + i.system.essenceCost, 0);
  const bi = a.items.filter(i => i.system.bodyCost)
    .reduce((s, i) => s + i.system.bodyCost, 0);
  const spend = a.items.filter(i => i.system.cost).reduce((s, i) => s + i.system.cost, 0);
  console.log(`${a.name}: ${a.items.length} items | Essence used ${ess.toFixed(2)} (${(6 - ess).toFixed(2)} left)`
    + ` | Body Index ${bi.toFixed(2)}/${a.system.bodyIndex.max} | ${spend.toLocaleString()}¥ of gear`);
}
