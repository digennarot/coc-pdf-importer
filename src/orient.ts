// Ad-hoc importer for the spells and Mythos tomes of Horror on the Orient
// Express (English edition, Books II–IV). Unlike the Chaosium appendices
// (appendix.ts) these are printed inline in the scenario text: a spell is an
// ALL-CAPS title run straight into "Cost : … Casting time : …" with no bullets,
// and a tome's stat line uses a lowercase "Sanity loss", a single "Cthulhu
// Mythos: +N percentiles" and bullets that extract as •, U+F034 or U+0017 (or
// none at all). Pure text in, the appendix item structures out — Foundry
// shaping is shared with the appendix items in document.ts.
import {
  parseSpellCosts,
  parseStudyUnits,
  titleCaseItemName,
} from "./appendix.ts";
import type { AppendixItem, AppendixSpell, AppendixTome } from "./appendix.ts";
import { dehyphenate } from "./process.ts";

// The books' running header, printed on every page — the guard that the text
// is one of them at all. Another book merely naming the campaign (an advert, a
// cross-reference) prints it a handful of times, so it must repeat.
const ORIENT_MARKER = /\bHorror on the Orient Express\b/g;
const isOrientExpress = (text: string) =>
  (text.match(ORIENT_MARKER) ?? []).length >= 20;

const CHAPTER_TITLE = String.raw`(?:through the alps|italy & beyond|constantinople & consequences|strangers on the train)`;

function normalize(text: string): string {
  return (
    text
      // Tome bullets: a real bullet, a private-use glyph, or a control char.
      .replace(/[-\u0017]/g, " • ")
      .replace(/[—–]/g, "-")
      // A split "fi" ligature ("fi rst", "fi re").
      .replace(/\bfi (?=[a-z]{2,})/g, "fi")
      .replace(/[’]/g, "'")
      // Running headers / footers ("62 Horror on the Orient Express
      // constantinople & consequences", "through the alps 57 Book 2 …").
      .replace(
        new RegExp(
          String.raw`\b(?:Book \d\s+)?(?:\d{1,3}\s+)*Horror on the Orient Express(?:\s+${CHAPTER_TITLE})?(?:\s+\d{1,3})*`,
          "g",
        ),
        " ",
      )
      .replace(
        new RegExp(
          String.raw`\b(?:Book \d\s+\d{1,3}\s+)?${CHAPTER_TITLE}(?:\s+\d{1,3})+(?:\s+Book \d)?\b`,
          "g",
        ),
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanSpaces(s: string): string {
  return s
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,;:.])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const cleanText = (s: string) => cleanSpaces(dehyphenate(s));

// An ALL-CAPS heading run of two or more words, or one long word — what ends
// a write-up when no next entry bounds it ("THE VISIONS", "SAMPLE MOB").
const CAPS_HEADING =
  /\s(?:[A-Z][A-Z'-]{2,}\s+(?:(?:OF|THE|A|IN|AND|TO)\s+)*)+[A-Z][A-Z'-]{2,}\b|\s[A-Z][A-Z'-]{5,}\b/;

// A caps title token ("SKIN", "YOG-SOTHOTH", "FEZ*", "(VARIANT", "VERSION)").
const isTitleToken = (t: string) =>
  /^\(?[A-Z][A-Z'/&-]*\*?\)?$/.test(t) && /[A-Z]/.test(t);

// The ALL-CAPS title run that ends `before`, or "" when the text before the
// entry is not one (the layout printed the title elsewhere).
function capsTitleAtEnd(before: string): string {
  const tokens = before.trim().split(/\s+/);
  const title: string[] = [];
  for (let i = tokens.length - 1; i >= 0 && title.length < 9; i--) {
    if (!isTitleToken(tokens[i])) break;
    title.unshift(tokens[i]);
  }
  // A lone letter opening the run is a drop cap or stray initial.
  while (title.length && /^[A-Z]$/.test(title[0])) title.shift();
  if (!title.some((t) => t.replace(/[^A-Z]/g, "").length >= 3)) return "";
  return title.join(" ");
}

// --- spells ----------------------------------------------------------------

const SPELL_ANCHOR =
  /\bCost\s*:\s*(.+?)\s+Casting\s+time\s*:\s*/gi;

// The casting time runs until a sentence end or the description's first
// capitalised word ("One round The Controller…" -> "One round").
function castingTime(rest: string): { time: string; length: number } {
  const tokens = rest.split(" ");
  const out: string[] = [];
  let length = 0;
  for (let i = 0; i < tokens.length && out.length < 14; i++) {
    const t = tokens[i];
    if (i > 0 && /^[A-Z]/.test(t)) break;
    out.push(t);
    length += t.length + 1;
    if (/\.$/.test(t)) break;
  }
  return { time: cleanSpaces(out.join(" ")).replace(/\.$/, ""), length };
}

// Trim a write-up to its last complete sentence.
function toLastSentence(s: string): string {
  const m = /^[\s\S]*[.!?]["')]?(?=\s|$)/.exec(s);
  return m ? m[0] : s;
}

export function parseOrientExpressSpells(rawText: string): AppendixSpell[] {
  if (!isOrientExpress(rawText)) return [];
  const text = normalize(rawText);
  const anchors: {
    title: string;
    titleAt: number;
    cost: string;
    time: string;
    bodyAt: number;
  }[] = [];
  for (const m of text.matchAll(SPELL_ANCHOR)) {
    const before = text.slice(Math.max(0, m.index - 120), m.index);
    const title = capsTitleAtEnd(before);
    const { time, length } = castingTime(
      text.slice(m.index + m[0].length, m.index + m[0].length + 200),
    );
    anchors.push({
      title,
      titleAt: title ? text.lastIndexOf(title, m.index) : m.index,
      cost: cleanText(m[1]).replace(/\.$/, ""),
      time,
      bodyAt: m.index + m[0].length + length,
    });
  }

  const spells: AppendixSpell[] = [];
  const seen = new Set<string>();
  anchors.forEach((a, i) => {
    if (!a.title) return; // title printed away from its Cost line
    let end = i + 1 < anchors.length ? anchors[i + 1].titleAt : text.length;
    end = Math.min(end, a.bodyAt + 3000);
    let body = text.slice(a.bodyAt, end);
    const stop = [
      CAPS_HEADING.exec(body)?.index,
      /\bSTR\s+\d/.exec(body)?.index,
      /•/.exec(body)?.index,
    ].filter((n): n is number => n !== undefined);
    if (stop.length) body = body.slice(0, Math.min(...stop));
    const description = toLastSentence(cleanText(body));
    const name = titleCaseItemName(a.title.replace(/\*+$/, ""));
    if (!description || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    spells.push({
      name,
      castingTime: a.time,
      costs: parseSpellCosts(a.cost),
      note: "",
      description,
    });
  });
  return spells;
}

// --- tomes -----------------------------------------------------------------

const LANG = String.raw`(?:(?:Old|Classical|Modern)\s+)?(?:Arabic|Persian|Turkish|Latin|Greek|English|French|German|Italian|Serbo-Croatian|Serbo-Croat|Bulgarian|Hungarian|Romanian|Hebrew|Aramaic|Coptic|Egyptian)`;

const TOME_STATS =
  /(?:•\s*)?Sanity\s+loss\s*:\s*(\S+)\s*•?\s*Cthulhu\s+Mythos\s*:\s*\+?(\d+)(?:\s*\/\s*\+?(\d+))?\s*(?:percentiles?|%)?\s*•?\s*Mythos\s+Rating\s*:\s*(\d+)\s*•?\s*Study\s*:\s*(.+?)\s*•?\s*(?:Suggested\s+)?Spells?\s*:\s*/gi;

// Where a tome's title starts in `win` (the text before its stats) and the
// title itself, closest to the stats wins:
//  - "NEW MYTHOS TOME: THE WHISPERING FEZ …" heading;
//  - "New Mythos Tome: Apocrypha of the Fez Persian, …";
//  - an ALL-CAPS title over its language line ("THE SCROLL OF THE HEAD Old
//    Arabic, …", "RASUL AL-ALBARIN In Arabic, …");
//  - a mixed-case title before "-in <language>" ("The Notebook of Dr. Moric
//    -in Serbo-Croatian, …").
function findTomeTitle(
  win: string,
): { title: string; at: number; biblioAt: number } | null {
  const found: { title: string; at: number; biblioAt: number }[] = [];
  for (const m of win.matchAll(
    /NEW MYTHOS TOME:?\s+((?:[A-Z][A-Z'-]*\s+)*[A-Z][A-Z'-]{2,})\b/g,
  ))
    found.push({ title: m[1], at: m.index, biblioAt: m.index + m[0].length });
  for (const m of win.matchAll(
    new RegExp(String.raw`New Mythos Tome:\s*(.+?)\s+(?=${LANG}\b)`, "g"),
  ))
    found.push({ title: m[1], at: m.index, biblioAt: m.index + m[0].length });
  for (const m of win.matchAll(
    new RegExp(
      String.raw`\s(?:In\s+)?${LANG}(?:\s+and\s+(?:${LANG}|hieroglyphs?))?\s*,`,
      "g",
    ),
  )) {
    const title = capsTitleAtEnd(win.slice(Math.max(0, m.index - 100), m.index));
    if (title)
      found.push({ title, at: win.lastIndexOf(title, m.index), biblioAt: m.index });
  }
  for (const m of win.matchAll(
    new RegExp(String.raw`\s*-\s*in\s+${LANG}\b`, "g"),
  )) {
    const t =
      /((?:The\s+)?[A-Z][\w'.]*(?:\s+(?:of|the|[A-Z][\w'.]*))*)\s*$/.exec(
        win.slice(Math.max(0, m.index - 100), m.index),
      );
    if (t)
      found.push({
        title: t[1],
        at: win.lastIndexOf(t[1], m.index),
        biblioAt: m.index,
      });
  }
  if (!found.length) return null;
  return found.reduce((a, b) => (b.biblioAt > a.biblioAt ? b : a));
}

// The bibliographic line after a title: up to its first sentence end (not a
// title abbreviation's period), or the description's first sentence.
function splitBiblio(s: string): { biblio: string; rest: string } {
  let period = -1;
  const re = /\.\s/g;
  for (let m = re.exec(s); m && m.index < 220; m = re.exec(s)) {
    if (/\b(?:Dr|Mr|Mrs|St|Prof|c|p)$/.test(s.slice(0, m.index))) continue;
    period = m.index;
    break;
  }
  // The line can run straight into the description ("…, author unknown This
  // is a bound book").
  const start = /\s(?=(?:This|It|These|Its|The|A|An)\s+[a-z])/.exec(s);
  if (start && start.index < 220 && (period < 0 || start.index < period))
    return { biblio: s.slice(0, start.index), rest: s.slice(start.index) };
  if (period >= 0)
    return { biblio: s.slice(0, period), rest: s.slice(period + 1) };
  return { biblio: s.length < 220 ? s : "", rest: s.length < 220 ? "" : s };
}

function parseBiblio(biblio: string): {
  language: string;
  author: string;
  date: string;
} {
  const parts = cleanText(biblio)
    .replace(/^-?\s*in\s+/i, "")
    .split(/\s*[,;]\s*/)
    .filter(Boolean);
  const language = parts.length ? parts[0] : "";
  let author = "";
  let date = "";
  for (const p of parts.slice(1)) {
    const by = /^(?:(?:written|translated)\s+)?by\s+(.+)$/i.exec(p);
    if (by && !author) author = by[1];
    else if (/^author|translator/i.test(p) && !author) author = p;
    else if (/\d|century|unknown|A\.D|B\.C/i.test(p)) date = date || p;
  }
  return { language, author, date };
}

// "None The Artifacts Two dozen …" -> "none"; a list ends at its sentence
// end, a heading, or a capitalised "The" that is not an entry's own start.
function tomeSpells(rest: string): string {
  if (/^none\b/i.test(rest)) return "none";
  let s = rest.slice(0, 300);
  // Searched with parentheticals blanked: "(see under The Blood Red Fez, p.
  // 54)" ends nothing.
  const masked = s
    .replace(/\([^)]*\)/g, (m) => "_".repeat(m.length))
    .replace(/\b(?:p|e\.g|i\.e)\.\s/g, (m) => m.replace(". ", "__"));
  const stops = [
    /\.\s/.exec(masked)?.index,
    CAPS_HEADING.exec(masked)?.index,
    /(?<!,)\sThe\s/.exec(masked)?.index,
    /\s\*[A-Z]/.exec(masked)?.index,
  ].filter((n): n is number => n !== undefined && n > 0);
  if (stops.length) s = s.slice(0, Math.min(...stops));
  return cleanText(s).replace(/\.$/, "");
}

export function parseOrientExpressTomes(rawText: string): AppendixTome[] {
  if (!isOrientExpress(rawText)) return [];
  const text = normalize(rawText);
  const tomes: AppendixTome[] = [];
  const seen = new Set<string>();
  let prevEnd = 0;
  for (const m of text.matchAll(TOME_STATS)) {
    const winStart = Math.max(prevEnd, m.index - 3000);
    const win = text.slice(winStart, m.index);
    prevEnd = m.index + m[0].length;
    const found = findTomeTitle(win);
    if (!found) continue;
    const { biblio, rest } = splitBiblio(win.slice(found.biblioAt).trim());
    const { language, author, date } = parseBiblio(biblio);
    const studyText = cleanText(m[5]);
    const study = /^(\d+)\s*(weeks?|days?|months?|hours?)\b/i.exec(studyText);
    const initial = Number(m[2]);
    const name = titleCaseItemName(cleanText(found.title));
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    tomes.push({
      name,
      language,
      author,
      date,
      physical: "",
      link: "",
      description: cleanText(
        // A study time with a note ("24 hours for the Persian, 12 hours for
        // the hieroglyph section") keeps it in the description.
        study && studyText !== study[0]
          ? `${rest} Study: ${studyText}.`
          : rest,
      ),
      relevance: "",
      sanityLoss: m[1].replace(/\s+/g, ""),
      cthulhuMythos: {
        initial,
        final: m[3] !== undefined ? Number(m[3]) : initial,
      },
      mythosRating: Number(m[4]),
      study: study
        ? { necessary: Number(study[1]), units: parseStudyUnits(study[2]) }
        : { necessary: 0, units: "CoC7.weeks" },
      spells: tomeSpells(text.slice(prevEnd)),
      region: "",
    });
  }
  return tomes;
}

export function parseOrientExpressItems(text: string): AppendixItem[] {
  return [
    ...parseOrientExpressSpells(text).map((s) => ({
      kind: "spell" as const,
      ...s,
    })),
    ...parseOrientExpressTomes(text).map((t) => ({
      kind: "tome" as const,
      ...t,
    })),
  ];
}
