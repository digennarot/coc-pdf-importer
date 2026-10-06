// Unit tests for the map importer's Foundry side. Foundry's globals (game,
// Folder, Scene, FilePicker, CONST) are replaced with a mock harness that
// records uploads and created documents.
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { importScenes, slug } from "./scene-import.ts";

// A picked file: a WebP header of the given size, at a folder-relative path.
function webp(path: string, width: number, height: number): File {
  const b = new Uint8Array(30);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
  b.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  const file = new File([b], path.split("/").pop()!, { type: "image/webp" });
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

let folders: any[];
let scenes: any[];
let journals: any[];
let actors: any[];
let uploads: { dir: string; name: string }[];
let dirs: Set<string>;

beforeEach(() => {
  folders = [];
  scenes = [];
  journals = [];
  actors = [];
  uploads = [];
  dirs = new Set();
  let n = 0;
  (globalThis as any).game = {
    world: { id: "test-world" },
    folders: { find: (p: any) => folders.find(p) },
    scenes: { filter: (p: any) => scenes.filter(p) },
    journal: { filter: (p: any) => journals.filter(p) },
    actors: { filter: (p: any) => actors.filter(p) },
  };
  (globalThis as any).JournalEntry = {
    create: async (d: any) => {
      const j: any = { id: "j" + ++n, ...d };
      j.delete = async () => journals.splice(journals.indexOf(j), 1);
      journals.push(j);
      return j;
    },
  };
  (globalThis as any).CONST = { GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 } };
  (globalThis as any).Folder = {
    create: async (d: any) => {
      const f = { id: "f" + ++n, ...d };
      folders.push(f);
      return f;
    },
  };
  (globalThis as any).Scene = {
    create: async (d: any) => {
      const s: any = { id: "s" + ++n, ...d, deleted: false };
      s.delete = async () => {
        s.deleted = true;
        scenes.splice(scenes.indexOf(s), 1);
      };
      scenes.push(s);
      return s;
    },
  };
  (globalThis as any).foundry = {
    applications: {
      apps: {
        FilePicker: {
          implementation: {
            browse: async (_s: string, path: string) => {
              if (!dirs.has(path)) throw new Error("missing");
            },
            createDirectory: async (_s: string, path: string) => {
              dirs.add(path);
            },
            upload: async (_s: string, dir: string, file: File) => {
              assert.ok(dirs.has(dir), `upload into a missing directory ${dir}`);
              uploads.push({ dir, name: file.name });
              return { path: `${dir}/${file.name}` };
            },
          },
        },
      },
    },
  };
});

afterEach(() => {
  for (const k of ["game", "CONST", "Folder", "Scene", "JournalEntry", "foundry"])
    delete (globalThis as any)[k];
});

describe("importScenes", () => {
  test("uploads each map and creates a sized, gridded Scene in mirrored folders", async () => {
    const res = await importScenes([
      webp("Pack/Chapter 01/01-MAPS/WEBP/01-Great Hall.webp", 2800, 2100),
      webp("Pack/Chapter 01/01-MAPS/WEBP/TOK-Truck.webp", 1120, 560),
      webp("Pack/Chapter 01/03-HANDOUTS/Letter.webp", 1000, 1400),
      webp("Pack/00-TITLE & LANDING PAGES/LP-1923.webp", 2100, 1400),
    ]);
    assert.equal(res.created, 2);
    assert.equal(res.failed, 0);
    assert.deepEqual(
      uploads,
      [
        { dir: "worlds/test-world/coc-pdf-importer/pack/chapter-01", name: "01-great-hall.webp" },
        { dir: "worlds/test-world/coc-pdf-importer/pack/00-title-landing-pages", name: "lp-1923.webp" },
        // The handout goes to its chapter's journal, not a Scene.
        { dir: "worlds/test-world/coc-pdf-importer/pack/chapter-01/handouts", name: "letter.webp" },
      ],
    );
    assert.equal(res.journals, 1);
    const hall = scenes.find((s) => s.name === "01-Great Hall");
    assert.equal(hall.width, 2800);
    assert.equal(hall.height, 2100);
    assert.equal(hall.padding, 0);
    assert.equal(hall.navigation, false);
    assert.equal(
      hall.background.src,
      "worlds/test-world/coc-pdf-importer/pack/chapter-01/01-great-hall.webp",
    );
    assert.deepEqual(hall.grid, { type: 1, size: 140 });
    const chapter = folders.find((f) => f.name === "Chapter 01");
    assert.equal(chapter.type, "Scene");
    assert.equal(chapter.folder, folders.find((f) => f.name === "Pack").id);
    assert.equal(hall.folder, chapter.id);
    const landing = scenes.find((s) => s.name === "LP-1923");
    assert.equal(landing.grid.type, 0);
  });

  test("a map whose upload the server refuses gets no Scene", async () => {
    const fp = (globalThis as any).foundry.applications.apps.FilePicker
      .implementation;
    const upload = fp.upload;
    // FilePicker.upload answers false / nothing / {} when the upload fails.
    fp.upload = async (s: string, dir: string, file: File) =>
      file.name === "02-bad.webp" ? false : upload(s, dir, file);
    const res = await importScenes([
      webp("Pack/Ch/01-Good.webp", 2800, 2100),
      webp("Pack/Ch/02-Bad.webp", 2800, 2100),
    ]);
    assert.equal(res.created, 1);
    assert.equal(res.failed, 1);
    assert.deepEqual(scenes.map((s) => s.name), ["01-Good"]);
  });

  test("the import stops when its first uploads all fail", async () => {
    const fp = (globalThis as any).foundry.applications.apps.FilePicker
      .implementation;
    let tries = 0;
    fp.upload = async () => (tries++, {});
    await assert.rejects(
      importScenes(
        [1, 2, 3, 4, 5].map((i) => webp(`Pack/Ch/0${i}-Map.webp`, 2800, 2100)),
      ),
      /import stopped: the server did not accept "03-Map.webp"/,
    );
    assert.equal(tries, 3);
    assert.equal(scenes.length, 0);
  });

  test("uploads go to The Forge's storage when running there", async () => {
    const fp = (globalThis as any).foundry.applications.apps.FilePicker
      .implementation;
    const sources: string[] = [];
    const upload = fp.upload;
    fp.upload = async (s: string, dir: string, file: File) => {
      sources.push(s);
      return upload(s, dir, file);
    };
    (globalThis as any).ForgeVTT = { usingTheForge: true };
    try {
      await importScenes([webp("Pack/Ch/01-Hall.webp", 2800, 2100)]);
    } finally {
      delete (globalThis as any).ForgeVTT;
    }
    assert.deepEqual(sources, ["forgevtt"]);
  });

  test("a re-import replaces the same-named scene in its folder", async () => {
    const pick = () => [webp("Pack/Ch/01-Hall.webp", 2800, 2100)];
    await importScenes(pick());
    await importScenes(pick());
    assert.equal(scenes.length, 1);
    assert.equal(folders.length, 2); // Pack, Ch — reused
  });

  test("an unreadable image counts as failed; progress reaches the total", async () => {
    const bad = new File([new Uint8Array(10)], "broken.webp");
    Object.defineProperty(bad, "webkitRelativePath", { value: "Pack/Ch/broken.webp" });
    (globalThis as any).createImageBitmap = async () => {
      throw new Error("undecodable");
    };
    const errors: unknown[] = [];
    const realError = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    const seen: [number, number][] = [];
    try {
      const res = await importScenes(
        [bad, webp("Pack/Ch/01-Hall.webp", 2800, 2100)],
        { onProgress: (d, t) => seen.push([d, t]) },
      );
      assert.equal(res.created, 1);
      assert.equal(res.failed, 1);
    } finally {
      console.error = realError;
      delete (globalThis as any).createImageBitmap;
    }
    assert.deepEqual(seen, [[1, 1]]);
    assert.equal(errors.length, 1);
  });
});

describe("importScenes — handouts and creature tokens", () => {
  const actor = (name: string, type: string, app?: number, edu?: number) => {
    const a: any = {
      name,
      type,
      system: { characteristics: { app: { value: app }, edu: { value: edu } } },
      updates: [] as any[],
    };
    a.update = async (u: any) => a.updates.push(u);
    actors.push(a);
    return a;
  };

  test("a chapter's English handouts become one journal of image pages", async () => {
    const res = await importScenes([
      webp("Pack/Chapter 01/03-HANDOUTS-ADJ/ENG-WEBP/02-Fire.webp", 1000, 1400),
      webp("Pack/Chapter 01/03-HANDOUTS-ADJ/ENG-WEBP/01-Note.webp", 1000, 1400),
      webp("Pack/Chapter 01/03-HANDOUTS-ADJ/FR-WEBP/01-Note.webp", 1000, 1400),
    ]);
    assert.equal(res.journals, 1);
    assert.equal(res.handouts, 2);
    assert.equal(scenes.length, 0);
    const [j] = journals;
    assert.equal(j.name, "Chapter 01");
    assert.equal(j.folder, folders.find((f) => f.name === "Pack" && f.type === "JournalEntry").id);
    assert.deepEqual(
      j.pages.map((p: any) => [p.name, p.type, p.src]),
      [
        ["01-Note", "image", "worlds/test-world/coc-pdf-importer/pack/chapter-01/handouts/01-note.webp"],
        ["02-Fire", "image", "worlds/test-world/coc-pdf-importer/pack/chapter-01/handouts/02-fire.webp"],
      ],
    );
  });

  test("a creature token becomes the art of the creature actors it names", async () => {
    const shantak = actor("Shantaks One", "creature");
    const soldier = actor("Soldier", "npc", 45, 10); // a person: not a creature token's
    const grimmitha = actor("Grimmitha (ur-rinna dauthi)", "npc"); // no APP/EDU
    const res = await importScenes([
      webp("Pack/Ch 5/01-MAPS/01-Plain.webp", 8400, 8400),
      webp("Pack/Ch 5/02-CREATURES TOKENS/TOK-Shantak-2730x1890.webp", 2730, 1890),
      webp("Pack/Ch 5/02-CREATURES TOKENS/TOK-SOLDIER-420x420.webp", 420, 420),
      webp("Pack/Ch 5/02-CREATURES TOKENS/TOK-Grimmitha-420x420.webp", 420, 420),
      webp("Pack/Ch 5/02-CREATURES TOKENS/TOK-Truck-1120x560.webp", 1120, 560),
    ]);
    assert.equal(res.tokens, 2);
    assert.deepEqual(res.unmatchedTokens.sort(), ["SOLDIER", "Truck"]);
    const src = "worlds/test-world/coc-pdf-importer/pack/ch-5/tokens/tok-shantak-2730x1890.webp";
    assert.deepEqual(shantak.updates, [
      {
        img: src,
        "prototypeToken.texture.src": src,
        "prototypeToken.width": 13,
        "prototypeToken.height": 9,
      },
    ]);
    assert.equal(soldier.updates.length, 0);
    assert.equal(grimmitha.updates.length, 1);
  });
});

describe("slug", () => {
  test("lowercase words joined by dashes, accents dropped, extension kept", () => {
    assert.equal(slug("00-TITLE & LANDING PAGES"), "00-title-landing-pages");
    assert.equal(slug("Orašac-NIGHT.webp"), "orasac-night.webp");
  });
});
