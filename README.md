# Call of Cthulhu PDF Importer

**English** · [Italiano](README.it.md)

## What's new

- **Maps as Scenes**: pick a folder of battle maps in the import dialog and
  every map image becomes a Scene, sized to the image and filed in Scene
  folders that mirror the picked folder (format-only levels such as
  `01-MAPS` or `WEBP-lower file size` are skipped, as are tokens and
  handouts). Title and landing pages come in gridless. When the folder holds
  the map pack's user manual (the Lovemaps Horror on the Orient Express pack
  documents each map as `8400 x 8400 … M 140 px`), each map's cell size is read
  from it and the grid is measured in metres; otherwise the cell size is
  inferred from the image's dimensions. Each chapter's English handouts
  (`03-HANDOUTS-ADJ/ENG-WEBP`) become a Journal Entry named after the chapter,
  one image page per handout, and each creature token (`02-CREATURES TOKENS`)
  and character token (`xx-Tokens`: NPCs, antagonists, pregenerated
  investigators) becomes the portrait and token art of the imported actors it
  names. The folder's other PDFs (props and player aids such as the US
  Passport or the Train Car Plans) become PDF pages of a "Documents" journal.
  A map whose image upload the server refuses no longer gets a Scene without a
  background: it counts as failed, and the import stops with the reason when
  the first uploads all fail.
- **Horror on the Orient Express spells and tomes**: the spells (`DRAIN THE
  FEZ Cost : … Casting time : …`) and Mythos tomes printed inline in Books
  II–IV are imported as items alongside the actors.
- **Horror on the Orient Express** (English edition, Chaosium boxed set):
  the NPCs, creatures and pre-generated investigators of Books II–V are
  imported. Book I has no stat blocks. The books' layout needed its own
  handling: ALL-CAPS names with nicknames and aliases (`"THE CRAWLING ONE (AKA
  …)"`), small-caps surnames (`LaVERGE`), descriptor-first pre-gen headings,
  column tables for groups (Sarnathians, Nightgaunts, Shantaks), open-ended
  values (`EDU 99+`), and weapon or spell prose kept out of attack names.
- **Words hyphenated across a line** (`de- flects`, `Sur- geon`) are rejoined
  in every imported field: names, occupations, attack notes, armor, Sanity
  loss, spells, gear and background text.
- The module now lives in [digennarot's fork](https://github.com/digennarot/coc-pdf-importer),
  with CI on every push and an automatic GitHub release on every push to
  `main` (see [Releasing](#releasing)).

## Overview

Import content from documents that use the standard Chaosium layout into the
[CoC7 system](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT).
Requires Foundry VTT v13+.

Tested on the following documents:

- Masks of Nyarlathotep (campaign book and Keeper Reference Booklet)
- Escape from Innsmouth
- The Two-Headed Serpent (campaign book and Keeper Reference Booklet)
- Down Darker Trails (setting book and Keeper Reference Booklet)
- Pulp Cthulhu
- CoC7 Quick Start
- CoC7 Keeper Rulebook (Part 3: Scenarios)
- Gateways to Terror
- Doors to Darkness
- Dead Light and Other Dark Turns
- Does Love Forgive
- Mansions of Madness
- The Lightless Beacon
- Horror on the Orient Express (English edition, Books II–V)

Only the English editions are supported: the parser reads the English stat
labels (STR, CON, SIZ…), so translated books such as the Italian
"Orrore sull'Orient Express" are not imported yet.

A single import reads a document once and creates both **actors** and, when the
document contains them, **items** (Pulp Cthulhu talents/archetypes, Chaosium
appendix Spells / Tomes / Artefacts, and Down Darker Trails' Old West
occupations, skills, weapons and spells). Everything is placed in folders named
after the source file; a re-import refreshes same-named entries instead of
duplicating them.

### Actors

Import actors from the various flavors of the standard stat block layout —
"Name, age N, description" blocks, pre-generated investigator sheets, monster
"average / rolls" tables, multi-column tables for NPC groups, and the
two-column layouts of the newer books (Innsmouth). Each block yields
characteristics, derived stats, combat, skills, languages, spells, Sanity loss,
armor, and — for pre-gens — the background sections and gear. Names printed in
ALL CAPS are proper-cased on import, and a stat block never absorbs text from
beyond its own pages, so long scenario prose stays out of the sheets.

Where the CoC7 system has a matching compendium item, the importer adopts it so
imported content keeps the real CoCID, icon, and properties:

- **Weapons** are matched to the system's weapon compendium (core content
  preferred over the wiki fallback), with size/alias handling for common melee
  and firearm names and correct thrown-weapon profiles. The book's printed
  damage always wins, but impale/range/skill metadata comes from the match.
- **Skills** are created with their specialization filled in, so specialized and
  "(Any)" skills don't prompt the sheet for a name on import.

Note that the importer skips large portions of description prose — maneuver
mechanics, creature flavor, and the like — so consult the source documents when
running the game.

### Pulp variants

Some books (Masks of Nyarlathotep, Escape from Innsmouth, The Two-Headed
Serpent) print optional **Pulp Combat** and **Pulp Talents** sections inside a
stat block. Such an actor is imported twice: the standard version into the
document's folder, and a Pulp variant into a sibling `<file name> (Pulp)` Actor
folder, created only when the document has at least one. The variant takes the
pulp combat profiles in place of the standard ones (and, where printed, the
pulp HP and Luck), and carries its talents as `talent` items. An existing
talent of the same name in the world is used (icon, category and CoCID kept)
but reads with the book's own description; otherwise an inline talent with
that description is created.

### Pulp Talents & Archetypes

The 40 player talents and 22 archetypes from the Pulp Cthulhu rulebook are
parsed and imported as CoC7 `talent` and `archetype` items. Archetypes carry
their core characteristic(s), bonus points, suggested occupations/traits, talent
count, and a resolved skill list (each skill mapped to its CoCID itemKey).

Items are filed in a `<file name>` **Item** folder with one subfolder per type
(`Talents`, `Archetypes`, `Spells`, `Tomes`, `Artefacts`, …); actors live at
the top level of a same-named **Actor** folder. (Foundry keeps Actor and Item
folders in separate trees, so these are two sibling folders of the same name.)

### Down Darker Trails

The Old West sourcebook's reference chapters are imported as items: the 26
occupations, its altered and new skills, the firearm and melee weapon tables,
and the shamanic / folk magic spells.

### Maps

The second field of the import dialog takes a folder. Each image in it becomes
a Scene (navigation off, no padding), its image uploaded under
`worlds/<world>/coc-pdf-importer/…` and its Scene filed in folders named after
the picked subfolders (Foundry nests at most four). Files whose name starts with
`TOK-` and folders named for tokens or handouts are skipped. The grid is, in
order: the cell size the pack's manual gives that map (a PDF named like a
manual or map key, in the folder), the cell size the folder's documented maps of
that size use, or the largest of 210 / 140 / 70 / 100 px that divides the image
exactly; an image none divides, and title or landing pages, are gridless. A
re-import replaces same-named Scenes in their folder.

Images in a folder named for handouts become **Journal Entries**: one per folder
holding the handouts folder (a chapter), named after it and filed under the
picked folder's name, with one image page per handout in file order. A
translation folder beside the English one (`FR-WEBP`) is skipped.

Images in a "Creatures Tokens" folder are matched to **actors already in the
world** — so import the books first — by creature name, ignoring an article,
"Sample", a parenthetical, a member number and a plural (`TOK-Shantak` →
"Shantaks One" … "Shantaks Six", `TOK-LLOIGOR A` → "Sample Lloigor"). Only
creatures, or NPCs without a human APP/EDU stat line, are matched, so an
automaton's "Soldier" token never lands on a human soldier. Each match gets the
token as its portrait and prototype token image, sized in cells by its
chapter's map grid; of a lettered set (`A` / `B` / `C`) the `A` image is used.
Tokens no actor matches are listed in the console.

The other images in a tokens folder (`xx-Tokens/…/NPC-CH03-Train-Egorov`,
`PC-1923-Grace Murphy`) are character tokens, matched to the remaining actors
by person name: the chapter prefix, a variant letter and titles (`Dr`, `Pr`,
`Cpt`, `Mme`) are ignored, a place or period segment (`Constantinople-`,
`-1893`) may be dropped, small misspellings are forgiven (`Hyeronimus`), a
lone first name or a titled surname matches the full name (`Barlas` →
`Barlas Demir`, `Professor Demir` → `Pr Ahmed Demir`), and a man's title never
matches a woman's (`Count` / `Countess`). Each match gets the token as its
portrait and prototype token image; frames are skipped.

PDFs in the folder other than the map-key manual and the books picked in the
document field (props, player aids, a handouts book) are uploaded and become
one "Documents" journal with a PDF page each.

### Spells, Tomes & Artefacts

Books that include Chaosium appendix sections (e.g. Masks of Nyarlathotep
Appendices B–D), or that print appendix-style entries inline in their chapters
(Escape from Innsmouth), yield world items:

- **Spells** — name, casting time, legacy cost fields (MP / SAN / POW / HP), and
  description body. Automated `costList` steps are not generated.
- **Tomes** — bibliographic metadata, Sanity / Mythos stats, study time; Link,
  Relevance, and spell lists go in the keeper notes (no spell item linking).
- **Artefacts** — full text in keeper notes; Foundry `weapon` when the body
  looks combat-capable, otherwise generic `item`. Nested under region folders
  when the appendix prints chapter banners (`Artefacts/Peru/…`).
- **Tomes** — also nest under region folders when a banner is present
  (`Tomes/Egypt/…`).

Horror on the Orient Express prints its spells and tomes inline rather than in
appendices; they are read by their own parser (`orient.ts`). A spell whose
title the layout places away from its `Cost :` line, and the Dzhudzheta
monograph (titled pages before its stats), are not imported.

## Usage

1. Install the module from

   ```console
   https://github.com/digennarot/coc-pdf-importer/releases/latest/download/module.json
   ```

2. Go to Settings → Game Settings → Call of Cthulhu PDF Importer → Import button
3. Upload the document(s) and wait until the import is complete
4. Navigate to the Actors or Items sidebar. Entries are created in folders named
   after the source file (items under typed subfolders such as `Talents` /
   `Spells` / `Tomes` / `Artefacts`).

## Development

### Prerequisites

- **Node.js 22+** (developed on Node 26). TypeScript sources are run directly
  via `node --experimental-strip-types`, so there is **no separate transpile
  step** for tests or tooling.
- `npm install` to pull dependencies (`pdfjs-dist`, `math.sumprecise`, and the
  dev toolchain: `esbuild`, `typescript`, `prettier`, `@thednp/dommatrix`).
- **7-Zip** is required only for `npm run build:module` (the release zip): the
  `7z` CLI on Windows, `7zz` (p7zip) on Linux/macOS.

### How it works

Parsing is split from Foundry entirely: `process.ts`, `pulp.ts`, `appendix.ts`,
`oldwest.ts`, `orient.ts` and `scenes.ts` never touch the Foundry API, which is
what makes them directly testable.

1. **Extraction & parsing** — `processPDF()` (in `process.ts`) uses `pdfjs-dist`
   to read every page's text runs **once**, keeping each run's font size. From
   that shared representation it runs independent parsers and returns
   `{ actors, items }`:
   - the **actor parser** strips repeating page furniture, finds stat-block
     anchors (the `STR … CON` run), recovers each block's name/age/description
     (using font size and page boundaries to separate a heading from body
     prose), and parses the stats into `CocCharacter`s. Multi-column group
     tables expand to one character per column.
   - the **item parsers** (`pulp.ts`, `appendix.ts`, `oldwest.ts`) read pulp
     talent/archetype tables, Chaosium appendix Spells/Tomes/Artefacts, and the
     Down Darker Trails reference chapters into internal item structures. Each
     is guarded by its book's own section markers, so a document without those
     sections yields no items. Source-faithful data stays unresolved (e.g. skill
     _names_, not CoCIDs).
2. **Import** — `importDocument()` (in `document.ts`) creates the world
   documents:
   - actors via `importCharacters()` (`importer.ts`), which maps each
     `CocCharacter` onto CoC7 actor system data and embedded items (skills,
     weapons + backing skills, spells), at the top level of a `<file name>`
     Actor folder.
   - items via `createPulpItems()` (`document.ts`), which builds the Foundry
     documents (resolving pulp skill names to CoCID itemKeys here) and files
     them under typed subfolders of a `<file name>` Item folder.

   A re-import replaces same-named entries in each folder instead of duplicating.

### npm scripts

Copy `fvtt.config.example.js` → `fvtt.config.js` and set `userDataPath` to your
Foundry user data folder (e.g. `/Users/YOU/foundrydata`). Builds then land in
`Data/modules/coc-pdf-importer/` under that path.

- `npm run dev` — esbuild in watch mode → rebuilds the module into Foundry’s
  `Data/modules/coc-pdf-importer/` (or repo root if `userDataPath` is unset)
- `npm run build` — one-off production bundle to the same destination
  (`module.js` + source map + pdf.js worker + `module.json` / `lang` /
  `templates`)
- `npm run build:module` — **release** build → `build/module.zip` +
  `build/module.json` (requires 7-Zip)
- `npm run release` — interactive: shows the current version, asks for the new
  one, and commits the version bump (`module.json` + `package.json` +
  `package-lock.json`) as `Release <version>`; pushing `main` then lets the
  release workflow tag, build and publish it
- `npm run type-check` — `tsc --noEmit` over `src/`, `test/`, `tools/`
- `npm test` — unit tests (fast, fixture-free, CI)
- `npm run test:integration` — book-level tests + golden snapshots — **needs the
  fixtures**
- `npm run dump:json` — parse every fixture (or one: `-- "<file.pdf>"`) →
  `out/<name>.json` (each file holds `{ actors, items }`)
- `npm run dump:text` — dump raw pdf.js text of a fixture → `out/<name>.txt`
  (for debugging extraction)

### Testing

Three tiers:

- **Unit** (`src/*.test.ts`, run by `npm test`) — fast, self-contained checks:
  the parsers against synthetic stat-block / reference text, and the Foundry
  builders against a mock harness. These use generic placeholder names, no
  copyrighted text, and are the CI gate.
- **Integration** (`test/integration/process.integration.test.ts`) — parse the
  real PDFs and assert on specific characters. Requires the fixtures.
- **Golden snapshots** (`test/integration/golden.test.ts`) — re-parse each
  fixture and compare the full `{ actors, items }` output byte-for-byte against
  `golden/<name>.json`, plus an assertion that no actor falls back to an
  "Unknown" name. This is the backward-compatibility guard: refactor the parsers
  freely, then confirm the snapshots are unchanged. To accept an intentional
  output change, run `npm run dump:json` and copy `out/*.json` into `golden/`.

The PDFs and snapshots are copyrighted and gitignored; integration and golden
tests **skip** when they're absent. See `fixtures/README.md` for the setup.

### The `Math.sumPrecise` / `DOMMatrix` shims

pdf.js needs `Math.sumPrecise` (recent JS) and a DOM `DOMMatrix`, which are
missing in Node and in older browsers. They are installed in three contexts:

- **Node** (tests + tooling): `node-setup.ts`, loaded via `--import`.
- **Browser main thread**: `import "math.sumprecise/auto"` at the top of
  `index.ts`, bundled into `module.js`.
- **Browser pdf.js worker**: `tools/copy-worker.js` prepends the shim to
  `pdf.worker.min.mjs` when it's copied into a build.

Without the worker shim, text extraction silently truncates glyph runs.

### Building for release

`npm run build:module` produces two artifacts in `build/`:

- `module.zip` — the installable module, packed with 7-Zip at ultra compression.
  It contains `module.json`, `module.js` (+ source map), the shimmed
  `pdf.worker.min.mjs`, and the `lang/` and `templates/` folders.
- `module.json` — a copy of the manifest served next to the zip, so a release's
  manifest URL can point at it while the download URL points at `module.zip`.

7-Zip must be installed (`7z` or `7zz` on PATH).

### Releasing

Every push to `main` is released. A push that does not bump the version itself
gets the next patch version automatically (`[minor]` / `[major]` in a pushed
commit's subject line picks the next minor / major instead; `[skip release]`
skips it; markers in a message body are ignored): the workflow commits the bump as `Release <version>` to `main`. To choose
the version by hand, push your own `Release <version>` commit (see
`npm run release`). The release workflow then tags the version, builds the
module, and creates the
GitHub release with `module.zip` and `module.json` attached. It then publishes
the version to the [Foundry VTT package listing](https://foundryvtt.com/packages/coc-pdf-importer)
through the Package Release API, pointing at that release's own `module.json`
asset and its release page, with the compatibility range taken from
`module.json` (`maximum` only when declared there).

The Foundry step needs a `FOUNDRY_RELEASE_TOKEN` repository secret holding the
package's release token (`fvttp_…`, generated on the package's foundryvtt.com
page); without it the step is skipped with a warning and the GitHub release
still goes out.
