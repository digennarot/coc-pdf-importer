// Integration test for the map planner against the Lovemaps Horror on the
// Orient Express pack: its folder tree and its user manual's map key. The pack
// is copyrighted and gitignored; the test skips when it is absent.
import { describe, test, before } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { extractPositionedText } from "../../src/process.ts";
import {
  IMAGE_HEADER_BYTES,
  imageSize,
  isMapKeyManual,
  parseMapKey,
  planScenes,
} from "../../src/scenes.ts";
import type { ScenePlan } from "../../src/scenes.ts";

const PARENT = "test/integration";
const PACK = "Horror on the Orient Express";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(path.join(PARENT, dir), { withFileTypes: true }))
    if (e.isDirectory()) out.push(...(await walk(`${dir}/${e.name}`)));
    else out.push(`${dir}/${e.name}`);
  return out;
}

describe("Horror on the Orient Express — map pack scenes", () => {
  let plans: ScenePlan[] = [];
  let keySize = 0;
  before(async () => {
    const files = await walk(PACK).catch(() => [] as string[]);
    const manual = files.find(isMapKeyManual);
    if (!manual) return;
    const key = parseMapKey(
      await extractPositionedText(
        new Uint8Array(await fs.readFile(path.join(PARENT, manual))),
      ),
    );
    keySize = key.length;
    const images = [];
    for (const f of files.filter((f) => /\.(?:webp|png|jpe?g)$/i.test(f))) {
      const fd = await fs.open(path.join(PARENT, f));
      const buf = Buffer.alloc(IMAGE_HEADER_BYTES);
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
      await fd.close();
      const size = imageSize(new Uint8Array(buf.subarray(0, bytesRead)));
      if (size) images.push({ path: f, size });
    }
    plans = planScenes(images, key);
  });

  const scene = (name: string) => {
    const p = plans.find((s) => s.name === name);
    assert.ok(p, `scene "${name}" not planned`);
    return p;
  };

  test("every map and landing page, no tokens or handouts", (t) => {
    if (!plans.length) return t.skip("map pack missing");
    assert.ok(keySize >= 180, `map key has ${keySize} entries`);
    assert.equal(plans.length, 500);
    assert.ok(plans.every((p) => !/TOK-|TOKENS|HANDOUTS/i.test(p.path)));
    assert.deepEqual(scene("05-Smith Apartment-DAY").folders, [
      PACK,
      "Chapter 03-1893",
    ]);
    assert.deepEqual(scene("01a-Locomotive-DAY").folders, [
      PACK,
      "00-Train-Orient Express",
      "02-Train MAPS-Separate Car",
    ]);
  });

  test("grids follow the manual where size alone is ambiguous", (t) => {
    if (!plans.length) return t.skip("map pack missing");
    const cell = (n: string) => scene(n).grid.size;
    assert.equal(cell("05-British museum-Reading Room"), 140);
    assert.equal(cell("04-St John Wood"), 210);
    assert.equal(cell("08-Orasac"), 140);
    assert.equal(cell("12-Cottage in the Wood"), 210);
    assert.equal(cell("16a-Nisra Island-GF-DAY"), 70);
    assert.equal(cell("01-Station Plaform-London"), 210);
    assert.equal(cell("01a-Hotel Vanoli-GF-DAY"), 140);
    assert.equal(scene("LP-1923").grid.gridless, true);
    assert.equal(scene("00-Title Screen-HOE-A").grid.gridless, true);
  });
});
