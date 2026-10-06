// Import a picked map-pack folder: each battle map becomes a Scene sized to its
// image, each chapter's handouts a Journal Entry with one image page per
// handout, and each creature token the portrait and token art of the actors it
// depicts. Images are uploaded into the world's data folder; documents are
// filed in folders mirroring the picked folder. The grid comes from the pack's
// manual when the folder holds one (see scenes.ts), otherwise from the image.
import { extractPositionedText } from "./process.ts";
import {
  IMAGE_HEADER_BYTES,
  chapterCellSizes,
  creatureKey,
  creatureTokenName,
  handoutJournal,
  imageSize,
  isCreatureToken,
  isHandoutImage,
  isMapKeyManual,
  isSceneImage,
  parseMapKey,
  planScenes,
  sceneName,
  tokenCells,
} from "./scenes.ts";
import type { ImageSize, MapKeyEntry, ScenePlan } from "./scenes.ts";

export interface ImportScenesOptions {
  /** Called after each scene, journal or token, for a progress display. */
  onProgress?: (done: number, total: number) => void;
}

export interface ImportScenesResult {
  created: number; // scenes
  failed: number;
  scenes: any[];
  journals: number;
  handouts: number;
  /** Actors given a creature token's art. */
  tokens: number;
  /** Creature tokens no imported actor matched (by token name). */
  unmatchedTokens: string[];
}

// The path of a picked file relative to the picked folder's parent
// ("Horror on the Orient Express/Chapter 01-LON/…/01-Challenger-Lecture.webp").
export function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name;
}

// A folder or file name safe in a data path: lowercase words joined by "-".
export function slug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "map"
  );
}

async function readSize(file: File): Promise<ImageSize | null> {
  const head = new Uint8Array(
    await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer(),
  );
  const size = imageSize(head);
  if (size) return size;
  // An unusual header: let the browser decode it.
  try {
    const bitmap = await createImageBitmap(file);
    const out = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return out;
  } catch {
    return null;
  }
}

async function readMapKey(files: File[]): Promise<MapKeyEntry[]> {
  const manual = files.find((f) => isMapKeyManual(relativePath(f)));
  if (!manual) return [];
  try {
    const pages = await extractPositionedText(
      new Uint8Array(await manual.arrayBuffer()),
    );
    return parseMapKey(pages);
  } catch (err) {
    console.warn("coc-pdf-importer: could not read the map key", err);
    return [];
  }
}

function filePicker(): FoundryFilePicker {
  const fp =
    foundry.applications.apps?.FilePicker?.implementation ??
    (globalThis as any).FilePicker;
  if (!fp) throw new Error("Foundry's FilePicker is unavailable");
  return fp;
}

// The file storage uploads go to: The Forge serves user data from its own
// "forgevtt" storage, every other host from the server's "data" folder.
export function uploadSource(): string {
  return (globalThis as any).ForgeVTT?.usingTheForge ? "forgevtt" : "data";
}

// Uploads into the world's data folder, creating each directory once.
class Uploader {
  #made = new Set<string>();
  base: string;
  source = uploadSource();
  constructor(base: string) {
    this.base = base;
  }

  async #ensure(dir: string): Promise<void> {
    const fp = filePicker();
    let path = "";
    for (const part of dir.split("/")) {
      path = path ? `${path}/${part}` : part;
      if (this.#made.has(path)) continue;
      try {
        await fp.browse(this.source, path);
      } catch {
        await fp.createDirectory(this.source, path, {});
      }
      this.#made.add(path);
    }
  }

  // Upload `file` under base/<slugged folders>; returns its path. Foundry's
  // FilePicker swallows upload errors (a rejected file, a proxy's "413 too
  // large") and answers without a path, so that is a failure: a document
  // pointing at a file that never arrived would show no image.
  async upload(file: File, folders: string[]): Promise<string> {
    const dir = [this.base, ...folders.map(slug)].join("/");
    await this.#ensure(dir);
    const named = new File([file], slug(file.name), { type: file.type });
    const response = await filePicker().upload(this.source, dir, named, {}, {
      notify: false,
    });
    if (!response || !response.path)
      throw new Error(
        `the server did not accept "${file.name}" ` +
          `(${(file.size / 1048576).toFixed(1)} MB) into ${this.source}:${dir}; ` +
          "check the upload permission and any proxy upload size limit",
      );
    return response.path;
  }
}

// Find (by name and parent) or create a folder of the given document type.
async function ensureFolder(
  name: string,
  parentId: string | null,
  type: string,
): Promise<FoundryFolder | null> {
  const existing = game.folders?.find(
    (f: any) =>
      f.name === name &&
      f.type === type &&
      (f.folder?.id ?? f.folder ?? null) === parentId,
  );
  if (existing) return existing;
  return Folder.create({ name, type, folder: parentId });
}

async function ensureFolderChain(
  names: string[],
  type: string,
): Promise<FoundryFolder | null> {
  let folder: FoundryFolder | null = null;
  for (const name of names)
    folder = await ensureFolder(name, folder?.id ?? null, type);
  return folder;
}

// Delete a same-named document in the folder, so a re-import refreshes it.
async function removeReplaced(
  collection:
    | { filter(p: (d: FoundryScene) => boolean): FoundryScene[] }
    | undefined,
  folder: FoundryFolder | null,
  name: string,
): Promise<void> {
  const folderId = folder?.id ?? null;
  const existing =
    collection?.filter(
      (s) =>
        s.name === name &&
        ((s.folder as any)?.id ?? s.folder ?? null) === folderId,
    ) ?? [];
  for (const doc of existing) await doc.delete();
}

// The Scene document for a planned map whose image was uploaded to `src`.
// A key-documented pack measures its cells in metres (1 cell ≈ 1 m).
export function sceneData(
  plan: ScenePlan,
  src: string,
  folderId: string | null,
  metric: boolean,
): object {
  return {
    name: plan.name,
    folder: folderId,
    navigation: false,
    width: plan.width,
    height: plan.height,
    padding: 0,
    background: { src },
    grid: {
      type: plan.grid.gridless
        ? (CONST.GRID_TYPES?.GRIDLESS ?? 0)
        : (CONST.GRID_TYPES?.SQUARE ?? 1),
      size: plan.grid.size,
      ...(metric && !plan.grid.gridless ? { distance: 1, units: "m" } : {}),
    },
  };
}

// An actor a creature token may depict: a creature, or an NPC whose stat line
// is not a person's (no APP / EDU) — never a human NPC who happens to share
// the token's name (a "Soldier").
function creatureLike(actor: FoundryActor): boolean {
  if (actor.type === "creature") return true;
  if (actor.type === "character") return false;
  const c = actor.system?.characteristics ?? {};
  return !(Number(c.app?.value) > 0 && Number(c.edu?.value) > 0);
}

// Consecutive failed uploads, before any success, that stop the import.
const ABORT_AFTER_FAILED_UPLOADS = 3;

// Import the picked folder's maps, handouts and creature tokens. Any other
// file is skipped.
export async function importScenes(
  files: File[],
  options: ImportScenesOptions = {},
): Promise<ImportScenesResult> {
  const result: ImportScenesResult = {
    created: 0,
    failed: 0,
    scenes: [],
    journals: 0,
    handouts: 0,
    tokens: 0,
    unmatchedTokens: [],
  };
  const byPath = new Map(files.map((f) => [relativePath(f), f]));
  const key = await readMapKey(files);

  const sized = async (path: string) => {
    const size = await readSize(byPath.get(path)!);
    if (!size) {
      result.failed++;
      console.error(`coc-pdf-importer: cannot read the size of "${path}"`);
    }
    return size;
  };

  const images: { path: string; size: ImageSize }[] = [];
  for (const path of byPath.keys()) {
    if (!isSceneImage(path)) continue;
    const size = await sized(path);
    if (size) images.push({ path, size });
  }
  const plans = planScenes(images, key);

  // Handouts, grouped into one journal per chapter, pages in file order.
  const journals = new Map<string, { folders: string[]; paths: string[] }>();
  for (const path of [...byPath.keys()].filter(isHandoutImage).sort()) {
    const { name, folders } = handoutJournal(path);
    const id = [...folders, name].join("/");
    if (!journals.has(id)) journals.set(id, { folders, paths: [] });
    journals.get(id)!.paths.push(path);
  }

  // Creature tokens: the unlettered or "A" variant of each creature.
  const tokens = new Map<string, { path: string; name: string }>();
  for (const path of [...byPath.keys()].filter(isCreatureToken).sort()) {
    const { name, variant } = creatureTokenName(path);
    const k = creatureKey(name);
    if (!k || (tokens.has(k) && variant > "A")) continue;
    if (!tokens.has(k) || !variant || variant === "A")
      tokens.set(k, { path, name });
  }

  const total = plans.length + journals.size + tokens.size;
  let done = 0;
  const step = () => options.onProgress?.(++done, total);
  const uploader = new Uploader(
    `worlds/${game.world?.id ?? "world"}/coc-pdf-importer`,
  );

  // Stop when the first uploads all fail: the rest would fail the same way.
  let uploaded = 0;
  let uploadFailures = 0;
  for (const plan of plans) {
    let src: string | null = null;
    try {
      src = await uploader.upload(byPath.get(plan.path)!, plan.folders);
      uploaded++;
      const folder = await ensureFolderChain(plan.folders, "Scene");
      await removeReplaced(game.scenes, folder, plan.name);
      const scene = await Scene.create(
        sceneData(plan, src, folder?.id ?? null, key.length > 0),
      );
      result.scenes.push(scene);
      result.created++;
    } catch (err) {
      result.failed++;
      console.error(`coc-pdf-importer: failed to import map "${plan.path}"`, err);
      if (!src && !uploaded && ++uploadFailures >= ABORT_AFTER_FAILED_UPLOADS)
        throw new Error(
          `map upload failed, import stopped: ${(err as Error).message}`,
        );
    }
    step();
  }

  for (const [id, { folders, paths }] of journals) {
    const name = id.split("/").pop()!;
    try {
      const pages = [];
      for (const path of paths) {
        const src = await uploader.upload(byPath.get(path)!, [
          ...folders,
          name,
          "handouts",
        ]);
        pages.push({ name: sceneName(path), type: "image", src });
      }
      const folder = await ensureFolderChain(folders, "JournalEntry");
      await removeReplaced(game.journal, folder, name);
      await JournalEntry.create({ name, folder: folder?.id ?? null, pages });
      result.journals++;
      result.handouts += pages.length;
    } catch (err) {
      result.failed++;
      console.error(`coc-pdf-importer: failed to import handouts "${id}"`, err);
    }
    step();
  }

  const actors = game.actors?.filter(creatureLike) ?? [];
  for (const [k, { path, name }] of tokens) {
    try {
      const matched = actors.filter((a) => creatureKey(a.name ?? "") === k);
      if (!matched.length) {
        result.unmatchedTokens.push(name);
      } else {
        const chapter = path.split("/")[1] ?? "";
        const src = await uploader.upload(byPath.get(path)!, [
          path.split("/")[0],
          chapter,
          "tokens",
        ]);
        const size = await sized(path);
        const cells = size
          ? tokenCells(size, chapterCellSizes(plans, chapter))
          : { width: 1, height: 1 };
        for (const actor of matched) {
          await actor.update({
            img: src,
            "prototypeToken.texture.src": src,
            "prototypeToken.width": cells.width,
            "prototypeToken.height": cells.height,
          });
          result.tokens++;
        }
      }
    } catch (err) {
      result.failed++;
      console.error(`coc-pdf-importer: failed to apply token "${path}"`, err);
    }
    step();
  }
  if (result.unmatchedTokens.length)
    console.info(
      "coc-pdf-importer: creature tokens with no matching actor (import the books first):",
      result.unmatchedTokens,
    );
  return result;
}
