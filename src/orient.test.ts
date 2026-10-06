// Unit tests for the Horror on the Orient Express spell/tome parser. Synthetic
// text only — mirrors the books' framing (ALL-CAPS titles run into "Cost : …
// Casting time : …", tome stat lines with odd bullet glyphs, the running
// header) without the books' own prose.
import { describe, test } from "node:test";
import assert from "node:assert";
import {
  parseOrientExpressSpells,
  parseOrientExpressTomes,
  parseOrientExpressItems,
} from "./orient.ts";

// The running header every page carries; the parser stands down without it.
const HEADER = " 12 Horror on the Orient Express through the alps ".repeat(25);

describe("parseOrientExpressSpells", () => {
  const TEXT =
    HEADER +
    "The cultists flee into the night. FOG OF TEST* Cost : 1D4 Sanity points Casting time : One round " +
    "The caster summons a thick fog that hides everything. It lasts an hour. " +
    "WARD OF TEST (VARIANT VERSION) Cost : 6 magic points; 1D4 Sanity points Casting Time : 30 minutes " +
    "Protects the caster against attack for a day. THE NEXT SCENE The investigators arrive. " +
    "The ritual needs a New Spell: Cost : 5 POW Casting time : 1 minute This mantra has no title of its own.";

  test("reads title, costs, casting time and body", () => {
    const spells = parseOrientExpressSpells(TEXT);
    assert.deepEqual(
      spells.map((s) => s.name),
      ["Fog of Test", "Ward of Test (Variant Version)"],
    );
    const [fog, ward] = spells;
    assert.equal(fog.castingTime, "One round");
    assert.equal(fog.costs.sanity, "1d4");
    assert.equal(
      fog.description,
      "The caster summons a thick fog that hides everything. It lasts an hour.",
    );
    assert.equal(ward.castingTime, "30 minutes");
    assert.equal(ward.costs.magicPoints, "6");
    // An ALL-CAPS heading ends the write-up.
    assert.equal(ward.description, "Protects the caster against attack for a day.");
  });

  test("a casting time runs on until the description's first sentence", () => {
    const [s] = parseOrientExpressSpells(
      HEADER +
        "GRAFT TEST Cost : 10 magic points; 2D6 Sanity points Casting Time : Two hours of chanting and prayer " +
        "This spell grafts a thing. ",
    );
    assert.equal(s.castingTime, "Two hours of chanting and prayer");
    assert.equal(s.description, "This spell grafts a thing.");
  });

  test("a repeated spell is kept once; a split 'fi' ligature is rejoined", () => {
    const spells = parseOrientExpressSpells(
      HEADER +
        "MELT TEST Cost : 5 magic points to cast fi rst time Casting time : 5 rounds Heats things. " +
        "MELT TEST Cost : 5 magic points Casting time : 5 rounds Heats things again. ",
    );
    assert.equal(spells.length, 1);
    assert.match(spells[0].costs.others, /cast first time/);
  });

  test("stands down without the books' running header", () => {
    assert.deepEqual(
      parseOrientExpressSpells(
        "FOG OF TEST Cost : 1D4 Sanity points Casting time : One round Fog. " +
          "See also Horror on the Orient Express.",
      ),
      [],
    );
  });
});

describe("parseOrientExpressTomes", () => {
  test("an ALL-CAPS title over its language line, with and without bullets", () => {
    const tomes = parseOrientExpressTomes(
      HEADER +
        "The lunch ends. THE SCROLL OF TEST Old Arabic, written by Some Author, 13th century " +
        "Sanity loss : 1D6+1 Cthulhu Mythos : +5 percentiles Mythos Rating : 18 Study : 40 hours Spells : none. " +
        "THE COPY English, from the Old Arabic; translator unknown " +
        " Sanity loss: 1D4  Cthulhu Mythos: +2 percentiles  Mythos Rating: 9  Study: 10 hours  Spells: None The Next Section begins.",
    );
    assert.deepEqual(
      tomes.map((t) => [t.name, t.language, t.author, t.date]),
      [
        ["The Scroll of Test", "Old Arabic", "Some Author", "13th century"],
        ["The Copy", "English", "translator unknown", ""],
      ],
    );
    const [scroll, copy] = tomes;
    assert.equal(scroll.sanityLoss, "1D6+1");
    assert.deepEqual(scroll.cthulhuMythos, { initial: 5, final: 5 });
    assert.equal(scroll.mythosRating, 18);
    assert.deepEqual(scroll.study, { necessary: 40, units: "CoC7.hours" });
    assert.equal(scroll.spells, "none");
    assert.equal(copy.spells, "none");
  });

  test("a 'New Mythos Tome:' heading, a description and a spell list", () => {
    const [t] = parseOrientExpressTomes(
      HEADER +
        "NEW MYTHOS TOME: THE MUMBLING HAT In Persian and hieroglyph, author unknown This is a bound book about hats. " +
        "\u0017 Sanity loss: 1D10 \u0017 Cthulhu Mythos: +7 percentiles \u0017 Mythos Rating: 21 " +
        "\u0017 Study: 24 hours for the Persian, 12 hours for the glyphs \u0017 Spells: Hat Ward (see under The Hat, p. 54), Doff Hat*. *Requires a hat.",
    );
    assert.equal(t.name, "The Mumbling Hat");
    assert.equal(t.language, "Persian and hieroglyph");
    assert.equal(t.author, "author unknown");
    assert.match(t.description, /^This is a bound book about hats\./);
    // The study note does not fit the study fields; it stays in the text.
    assert.match(t.description, /Study: 24 hours for the Persian/);
    assert.equal(t.spells, "Hat Ward (see under The Hat, p. 54), Doff Hat*");
  });

  test("a mixed-case title before '—in <language>'", () => {
    const [t] = parseOrientExpressTomes(
      HEADER +
        "The Diary of Dr. Test is short. The Diary of Dr. Test —in Serbo-Croatian, by Dr. Some Test, 1923 (unpublished). " +
        "A personal account. • Sanity loss: 1D3 • Cthulhu Mythos: +4 percentiles • Mythos Rating: 10 " +
        "• Study: 3 days • Spells: None",
    );
    assert.equal(t.name, "The Diary of Dr. Test");
    assert.equal(t.language, "Serbo-Croatian");
    assert.equal(t.author, "Dr. Some Test");
    assert.equal(t.date, "1923 (unpublished)");
    assert.equal(t.description, "A personal account.");
    assert.deepEqual(t.study, { necessary: 3, units: "CoC7.days" });
  });

  test("stat lines with no title nearby are skipped", () => {
    assert.deepEqual(
      parseOrientExpressTomes(
        HEADER +
          "the author seems mentally imbalanced.  Sanity loss: 1D3  Cthulhu Mythos: +1 percentile " +
          " Mythos Rating: 27  Study: 3 hours  Spells: None",
      ),
      [],
    );
  });
});

describe("parseOrientExpressItems", () => {
  test("tags spells and tomes", () => {
    const items = parseOrientExpressItems(
      HEADER +
        "FOG OF TEST Cost : 1D4 Sanity points Casting time : One round Makes fog. " +
        "THE SCROLL OF TEST Old Arabic, written by Some Author, 13th century " +
        "Sanity loss : 1D4 Cthulhu Mythos : +2 percentiles Mythos Rating : 12 Study : 24 hours Spells : Fog of Test",
    );
    assert.deepEqual(
      items.map((i) => [i.kind, i.name]),
      [
        ["spell", "Fog of Test"],
        ["tome", "The Scroll of Test"],
      ],
    );
  });

  test("returns [] for any other book", () => {
    assert.deepEqual(parseOrientExpressItems("just some prose"), []);
  });
});
