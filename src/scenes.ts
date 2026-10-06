// Planning for the map importer: which images in a picked folder become
// Scenes, under which Scene folders, with what name and grid. Pure — no
// Foundry, no pdf.js — so it is unit-testable; scene-import.ts does the
// uploading and document creation.
//
// Built around map packs laid out as a tree of folders of battle maps (the
// Lovemaps Horror on the Orient Express pack: "Chapter 03-1893/01-MAPS/WEBP-
// lower file size/05-Smith Apartment-DAY.webp"). Such a pack ships gridless
// images whose cell size varies per map (70, 140 or 210 px) and documents it
// in a user manual ("2800 x 2100 … M 140 px"); parseMapKey reads that key.

export interface ImageSize {
  width: number;
  height: number;
}

// Read an image's pixel size from its header (WebP, PNG, JPEG, GIF) without
// decoding it — the maps run to 8400 x 8400 px. Null when not recognised.
export function imageSize(b: Uint8Array): ImageSize | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...b.subarray(from, to));
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) =>
    ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const chunk = ascii(12, 16);
    if (chunk === "VP8X")
      return { width: 1 + u24le(24), height: 1 + u24le(27) };
    if (chunk === "VP8 ")
      return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 4) === "PNG")
    return { width: u32be(16), height: u32be(20) };
  if (b.length >= 10 && ascii(0, 3) === "GIF")
    return { width: u16le(6), height: u16le(8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // Walk the JPEG segments to the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      )
        return { width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

// How many leading bytes imageSize reads: a JPEG's frame header can sit past
// embedded metadata (650 KB of it in one title screen).
export const IMAGE_HEADER_BYTES = 1024 * 1024;

const IMAGE_EXT = /\.(?:webp|png|jpe?g|gif|avif)$/i;

// Whether a file of the picked folder becomes a Scene: an image, but not a
// token or handout — those are art for actors and journals, not maps. A
// pack's token cut-outs can sit in the map folders ("TOK-Truck-1120x560").
export function isSceneImage(path: string): boolean {
  if (!IMAGE_EXT.test(path)) return false;
  const parts = path.split("/");
  const file = parts[parts.length - 1];
  if (/^TOK[-_ ]/i.test(file)) return false;
  return !parts.slice(0, -1).some((p) => /tokens?\b|handouts?\b/i.test(p));
}

// Folder segments that only describe the files' format or kind, and add
// nothing to the Scene folder tree ("01-MAPS", "WEBP-lower file size").
const NOISE_FOLDER =
  /^(?:\d+[- ]?)?maps$|^(?:webp|png|jpe?g|gif|avif|hd|sd|gridless|grid)\b/i;

// Foundry nests folders at most four deep.
const MAX_FOLDER_DEPTH = 4;

// The Scene folder chain for an image at `path` (relative to the picked
// folder, which is its first segment): its directories, without format-only
// ones, capped at Foundry's nesting depth.
export function sceneFolderPath(path: string): string[] {
  const dirs = path.split("/").slice(0, -1);
  return dirs
    .filter((d, i) => i === 0 || !NOISE_FOLDER.test(d.trim()))
    .slice(0, MAX_FOLDER_DEPTH);
}

// The Scene name: the file name without its extension, as the pack names it
// ("05-Smith Apartment-DAY"); its index keeps variants in print order.
export function sceneName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(IMAGE_EXT, "").trim();
}

// --- map key ---------------------------------------------------------------

// One map documented in a pack's manual: its title, pixel size and cell size.
export interface MapKeyEntry {
  name: string;
  width: number;
  height: number;
  cell: number;
}

export interface PositionedText {
  str: string;
  x: number;
  y: number; // baseline height from the page's bottom (PDF coordinates)
}

// Read the map key from a manual's pages. Each map is printed as a numbered
// title ("05" "British museum-Reading Room"), its size below ("8400 x
// 8400"), and its cell size below that ("M" "140 px"), all in one column.
export function parseMapKey(pages: PositionedText[][]): MapKeyEntry[] {
  const out: MapKeyEntry[] = [];
  for (const raw of pages) {
    const items = raw
      .map((i) => ({ ...i, str: i.str.trim() }))
      .filter((i) => i.str);
    const sizes = items.filter((i) => /^\d{3,5}\s*x\s*\d{3,5}$/i.test(i.str));
    const cells = items.filter((i) => /^\d{2,3}\s*px$/i.test(i.str));
    const nums = items.filter((i) => /^\d{2}[a-z]?$/.test(i.str));
    for (const s of sizes) {
      const cell = cells
        .filter((c) => Math.abs(c.x - s.x) < 8 && c.y < s.y && s.y - c.y < 80)
        .sort((a, b) => b.y - a.y)[0];
      if (!cell) continue;
      const num = nums
        .filter(
          (n) =>
            Math.abs(n.x - s.x - 11) < 12 && n.y > s.y && n.y - s.y < 200,
        )
        .sort((a, b) => a.y - b.y)[0];
      const name = num
        ? items.find(
            (i) =>
              i !== num &&
              Math.abs(i.y - num.y) < 6 &&
              i.x > num.x &&
              i.x - num.x < 30,
          )
        : undefined;
      const [width, height] = s.str.split(/\s*x\s*/i).map(Number);
      out.push({
        name: name?.str ?? "",
        width,
        height,
        cell: parseInt(cell.str, 10),
      });
    }
  }
  return out;
}

// --- grid ------------------------------------------------------------------

export interface SceneGrid {
  gridless: boolean;
  size: number; // pixels per cell
}

// Words that name a variant of a map rather than the map ("GF", "NIGHT").
const VARIANT_WORDS = new Set([
  "the",
  "of",
  "de",
  "di",
  "a",
  "gf",
  "1f",
  "2f",
  "3f",
  "4f",
  "5f",
  "6f",
  "day",
  "night",
  "insane",
  "hell",
  "dream",
  "version",
  "complete",
]);

function nameTokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !VARIANT_WORDS.has(t) && !/^\d+[a-z]?$/.test(t));
}

// The key entry for a map: the one whose title names it ("Makryat Shop-GF"
// for "06b-Makryat Shop-GF-NIGHT"), preferring one of its size.
function keyedCell(
  name: string,
  size: ImageSize,
  key: MapKeyEntry[],
): number | null {
  const tokens = new Set(nameTokens(name));
  const sameSize = (e: MapKeyEntry) =>
    Math.abs(e.width - size.width) <= 12 &&
    Math.abs(e.height - size.height) <= 12;
  const named = key
    .map((e) => ({ e, t: nameTokens(e.name) }))
    .filter(({ t }) => t.length && t.every((x) => tokens.has(x)))
    .sort(
      (a, b) =>
        Number(sameSize(b.e)) - Number(sameSize(a.e)) || b.t.length - a.t.length,
    );
  if (named.length && sameSize(named[0].e)) return named[0].e.cell;
  // A size only one cell size is documented for.
  const cells = new Set(key.filter(sameSize).map((e) => e.cell));
  if (cells.size === 1) return [...cells][0];
  // A variant laid out differently (floors side by side) keeps its map's cell.
  if (named.length) return named[0].e.cell;
  return null;
}

// Cell sizes a battle map is cut to, most common first.
const CELL_SIZES = [210, 140, 70, 100, 200, 150, 50];

// The grid for one image. A title or landing page is a backdrop, not a
// battle map: gridless. Otherwise the map key decides, then the cell size the
// folder's other maps of that size were given, then the largest common cell
// size that divides the image exactly. An image no cell size divides is
// gridless.
export function sceneGrid(
  path: string,
  size: ImageSize,
  key: MapKeyEntry[] = [],
  siblings: { size: ImageSize; cell: number }[] = [],
): SceneGrid {
  if (path.split("/").some((p) => /landing|title/i.test(p)))
    return { gridless: true, size: 100 };
  const keyed = keyedCell(sceneName(path), size, key);
  if (keyed) return { gridless: false, size: keyed };
  const tally = new Map<number, number>();
  for (const s of siblings)
    if (s.size.width === size.width && s.size.height === size.height)
      tally.set(s.cell, (tally.get(s.cell) ?? 0) + 1);
  const best = [...tally].sort((a, b) => b[1] - a[1])[0];
  if (best) return { gridless: false, size: best[0] };
  const fit = CELL_SIZES.find(
    (c) => size.width % c === 0 && size.height % c === 0,
  );
  return fit ? { gridless: false, size: fit } : { gridless: true, size: 100 };
}

// --- plan ------------------------------------------------------------------

export interface ScenePlan {
  path: string; // relative to the picked folder's parent
  name: string;
  folders: string[];
  width: number;
  height: number;
  grid: SceneGrid;
}

// Plan every scene of a picked folder from its images' paths and sizes. Grids
// are settled in two passes so a map the key cannot place can follow the
// keyed maps of its folder.
export function planScenes(
  images: { path: string; size: ImageSize }[],
  key: MapKeyEntry[] = [],
): ScenePlan[] {
  const folderOf = (p: string) => p.split("/").slice(0, -1).join("/");
  const keyedByFolder = new Map<string, { size: ImageSize; cell: number }[]>();
  for (const { path, size } of images) {
    const cell = keyedCell(sceneName(path), size, key);
    if (cell == null) continue;
    const list = keyedByFolder.get(folderOf(path)) ?? [];
    list.push({ size, cell });
    keyedByFolder.set(folderOf(path), list);
  }
  return images
    .filter(({ path }) => isSceneImage(path))
    .map(({ path, size }) => ({
      path,
      name: sceneName(path),
      folders: sceneFolderPath(path),
      width: size.width,
      height: size.height,
      grid: sceneGrid(path, size, key, keyedByFolder.get(folderOf(path))),
    }));
}

// The manual that carries a pack's map key, among the picked folder's files.
export function isMapKeyManual(path: string): boolean {
  return /\.pdf$/i.test(path) && /manual|map\s*key|guide/i.test(path);
}

// --- creature tokens and handouts -------------------------------------------

const isImage = (path: string) => IMAGE_EXT.test(path);
const dirsOf = (path: string) => path.split("/").slice(0, -1);

// A creature token: an image in a "Creatures Tokens" folder.
export function isCreatureToken(path: string): boolean {
  return isImage(path) && dirsOf(path).some((d) => /creatures?\s*tokens?/i.test(d));
}

// A language folder other than English ("FR-WEBP"): a translated copy.
const OTHER_LANGUAGE = /^(?:fr|fra|de|deu|ger|es|esp|spa|it|ita|pt|pl|ru|jp)\b/i;

// A handout: an image in a "Handouts" folder, in English when the pack ships
// translations side by side ("ENG-WEBP" / "FR-WEBP").
export function isHandoutImage(path: string): boolean {
  if (!isImage(path)) return false;
  const dirs = dirsOf(path);
  const at = dirs.findIndex((d) => /handouts?/i.test(d));
  return at >= 0 && !dirs.slice(at + 1).some((d) => OTHER_LANGUAGE.test(d));
}

// The journal a handout belongs to: the folder holding its "Handouts" folder
// ("Chapter 01-LON"), filed under the picked folder.
export function handoutJournal(path: string): {
  name: string;
  folders: string[];
} {
  const dirs = dirsOf(path);
  const at = dirs.findIndex((d) => /handouts?/i.test(d));
  const owner = at > 0 ? dirs[at - 1] : dirs[0];
  return { name: owner, folders: dirs.slice(0, Math.min(1, at)) };
}

// The creature a token depicts and its variant letter:
// "TOK-Lloigor A-1260x1260" -> { name: "Lloigor", variant: "A" }.
export function creatureTokenName(path: string): {
  name: string;
  variant: string;
} {
  const base = sceneName(path)
    .replace(/^TOK[-_ ]*/i, "")
    .replace(/[-_ ]*\d{2,5}\s*x\s*\d{2,5}$/i, "")
    .trim();
  const m = /^(.*\S)\s+([A-Z])$/.exec(base);
  return m ? { name: m[1], variant: m[2] } : { name: base, variant: "" };
}

const ORDINALS =
  /\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)$/;

// A creature name reduced for matching a token to an actor: no article or
// "Sample", parenthetical, member number or plural ("Shantaks One",
// "Sample Lloigor", "Fill (ur-rinna dauthi)" -> "shantak", "lloigor", "fill").
export function creatureKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(?:the|a|an|sample)\s+/, "")
    .replace(ORDINALS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/(?<=[a-z]{3})s$/, "");
}

// The token's footprint in grid cells, by the cell size its chapter's maps
// use (most common first) that divides it, else the common cell sizes.
export function tokenCells(
  size: ImageSize,
  chapterCells: number[] = [],
): { width: number; height: number } {
  for (const c of [...chapterCells, 210, 140, 70])
    if (size.width % c === 0 && size.height % c === 0)
      return { width: size.width / c, height: size.height / c };
  const c = chapterCells[0] ?? 140;
  return {
    width: Math.max(1, Math.round(size.width / c)),
    height: Math.max(1, Math.round(size.height / c)),
  };
}

// The cell sizes of a chapter's planned maps, most common first.
export function chapterCellSizes(plans: ScenePlan[], chapter: string): number[] {
  const tally = new Map<number, number>();
  for (const p of plans)
    if (!p.grid.gridless && p.folders[1] === chapter)
      tally.set(p.grid.size, (tally.get(p.grid.size) ?? 0) + 1);
  return [...tally].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

// --- character tokens --------------------------------------------------------

// A character token: an image in a tokens folder that is not a creature token
// ("xx-Tokens/HOE-TOKENS-WEBP/TOK-Chapter 1-London/NPC-CH01-Inspector
// Fleming"), nor a frame to draw tokens with.
export function isCharacterToken(path: string): boolean {
  if (!isImage(path) || isCreatureToken(path)) return false;
  const dirs = dirsOf(path);
  return (
    dirs.some((d) => /tokens?\b/i.test(d)) &&
    !dirs.some((d) => /^frames?$/i.test(d)) &&
    !/frame/i.test(sceneName(path))
  );
}

// A character token's name, without its chapter prefix ("NPC-CH03-",
// "PC-1923-", "NPC-Strangers-") and variant letter ("Ilsa von Hofler A",
// "John Milton-B"): "Constantinople-Barlas Demir", "Dr Julius Smith-Burned".
export function characterTokenName(path: string): {
  name: string;
  variant: string;
} {
  const base = sceneName(path)
    .replace(/^(?:NPC|PC)-(?:CH\d+|OE|\d{3,4}|[A-Za-z]+)-/i, "")
    .trim();
  const m = /^(.*\S)(?:\s+|-)([A-Z])$/.exec(base);
  return m ? { name: m[1], variant: m[2] } : { name: base, variant: "" };
}

// The names a token may stand for, longest first: its name and each run of
// its "-" segments, since a segment can be a place or a state
// ("Constantinople-Barlas Demir", "Mehmet Makryat-London") or part of the name
// itself ("Dr Jean-Louis Saroch", "Unwen Ga-Walith").
export function characterTokenCandidates(name: string): string[] {
  const parts = name.split("-").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (let len = parts.length; len > 0; len--)
    for (let i = 0; i + len <= parts.length; i++)
      out.push(parts.slice(i, i + len).join("-"));
  return out;
}

const MALE_TITLES = new Set(
  "mr sir lord count baron duc duke king prince father padre don brother messire".split(" "),
);
const FEMALE_TITLES = new Set(
  "mrs miss ms mme madame madam mlle lady countess baroness dona sister".split(" "),
);
const TITLES = new Set([
  ...MALE_TITLES,
  ...FEMALE_TITLES,
  ..."dr doctor pr prof professor cpt capt captain col colonel lt lieutenant major sgt inspector the a an sample typical ret bart et al aka staff".split(" "),
]);

// The words of a name, folded to plain lowercase letters: no accents,
// parenthetical, nickname in quotes or possessive; an elided article joins
// its word ("Martinus de L'Isles" -> "martinus de isles", "O'Bannon" ->
// "bannon").
function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/(^|\s)["\u201c'\u2018][^"\u201d'\u2019]*["\u201d'\u2019](?=\s|$)/g, " ")
    .replace(/['\u2019]s\b/g, "")
    .replace(/\b[a-z]['\u2019](?=[a-z])/g, "")
    .replace(/['\u2019]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// A person's name reduced to the words that identify them: no titles,
// initials or member number, singular ("Elizabeth 'Ellie' Myers" ->
// ["elizabeth", "myer"]). A year stays: "Selim Makryat-1893" is not simply
// "Selim Makryat".
export function personWords(name: string): string[] {
  return nameWords(name)
    .filter(
      (w) =>
        w.length > 1 &&
        !TITLES.has(w) &&
        !/^(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(w),
    )
    .map((w) => w.replace(/(?<=[a-z]{3})s$/, ""));
}

// "m" / "f" for a name's gendered title ("Countess", "Mr"), else "".
function titleGender(name: string): string {
  const words = nameWords(name);
  if (words.some((w) => FEMALE_TITLES.has(w))) return "f";
  if (words.some((w) => MALE_TITLES.has(w))) return "m";
  return "";
}

const hasTitle = (name: string) => nameWords(name).some((w) => TITLES.has(w));

// Edit distance, for the pack's misspellings ("Mehmey", "Hyeronimus").
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length];
}

const sameWord = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 5 &&
    editDistance(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1));

// How well a token name fits an actor's name: 3 the same words; 2 every word
// of one found in the other (two words at least); 1 a lone first name that
// starts the other ("Barlas" / "Barlas Demir", "Nisra" / "Nisra the Daughter
// of Fate"), or a titled lone surname that ends a titled other ("Professor
// Demir" / "Pr Ahmed Demir"); 0 no match. A man's title never fits a woman's
// ("Count" / "Countess").
export function personMatch(token: string, actor: string): number {
  const t = personWords(token);
  const a = personWords(actor);
  if (!t.length || !a.length) return 0;
  const gt = titleGender(token);
  const ga = titleGender(actor);
  if (gt && ga && gt !== ga) return 0;
  const within = (x: string[], y: string[]) =>
    x.every((w) => y.some((v) => sameWord(w, v)));
  if (t.length === a.length && within(t, a)) return 3;
  if ((t.length >= 2 && within(t, a)) || (a.length >= 2 && within(a, t)))
    return 2;
  const lone = (one: string, oneName: string, other: string[], otherName: string) =>
    (one.length >= 4 && !hasTitle(oneName) && one === other[0]) ||
    (hasTitle(oneName) && hasTitle(otherName) && sameWord(one, other[other.length - 1]));
  if (t.length === 1 && lone(t[0], token, a, actor)) return 1;
  if (a.length === 1 && lone(a[0], actor, t, token)) return 1;
  return 0;
}

// The token each actor gets: for every actor name, the best-fitting token —
// the closest fit, then the token whose whole name fits (not a place- or
// period-qualified copy, "Selim Makryat-1893"), then the token without (or
// with the first) variant letter, then the path. Returns actor name -> path.
export function matchCharacterTokens(
  tokenPaths: string[],
  actorNames: string[],
): Map<string, string> {
  type Fit = { path: string; rest: number; score: number; variant: string };
  const best = new Map<string, Fit>();
  const rank = (v: string) => (v ? v.charCodeAt(0) - 64 : 0.5);
  const better = (x: Fit, y: Fit) =>
    x.score !== y.score
      ? x.score > y.score
      : x.rest !== y.rest
        ? x.rest < y.rest
        : x.variant !== y.variant
          ? rank(x.variant) < rank(y.variant)
          : x.path < y.path;
  const names = [...new Set(actorNames)];
  for (const path of [...tokenPaths].sort()) {
    const { name, variant } = characterTokenName(path);
    for (const candidate of characterTokenCandidates(name)) {
      const fits = names
        .map((n) => ({ n, score: personMatch(candidate, n) }))
        .filter((f) => f.score > 0);
      if (!fits.length) continue;
      const rest = name.length - candidate.length;
      for (const { n, score } of fits) {
        const fit = { path, rest, score, variant };
        const cur = best.get(n);
        if (!cur || better(fit, cur)) best.set(n, fit);
      }
      break; // the longest candidate that names someone
    }
  }
  return new Map([...best].map(([n, f]) => [n, f.path]));
}

// --- documents -----------------------------------------------------------

// A PDF of the pack worth reading in Foundry: a prop or player aid ("US
// Passport", "Train Car Plans"), not the map-key manual.
export function isDocumentPdf(path: string): boolean {
  return /\.pdf$/i.test(path) && !isMapKeyManual(path);
}

// A document's page title: "European_Route_Map_Hi-Res_PDF1.pdf" ->
// "European Route Map Hi-Res".
export function documentTitle(path: string): string {
  const file = path.split("/").pop() ?? path;
  return (
    file
      .replace(/\.pdf$/i, "")
      .replace(/[_ ]+PDF\d*$/i, "")
      .replace(/_+/g, " ")
      .trim() || file
  );
}
