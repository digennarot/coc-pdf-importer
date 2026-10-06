// Unit tests for the map planner: image-size sniffing, which files become
// Scenes, their folders, names and grids, and the map key read from a
// manual's positioned text. Synthetic data only.
import { describe, test } from "node:test";
import assert from "node:assert";
import {
  creatureKey,
  creatureTokenName,
  handoutJournal,
  imageSize,
  isCreatureToken,
  isHandoutImage,
  tokenCells,
  isMapKeyManual,
  isSceneImage,
  parseMapKey,
  planScenes,
  sceneFolderPath,
  sceneGrid,
  sceneName,
} from "./scenes.ts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

describe("imageSize", () => {
  test("WebP (VP8X, VP8L, VP8)", () => {
    const vp8x = bytes(
      "RIFF",
      [0, 0, 0, 0],
      "WEBPVP8X",
      [10, 0, 0, 0, 0, 0, 0, 0],
      le24(8400 - 1),
      le24(7000 - 1),
    );
    assert.deepEqual(imageSize(vp8x), { width: 8400, height: 7000 });
    const v = (2100 - 1) | ((5460 - 1) << 14);
    const vp8l = bytes(
      "RIFF",
      [0, 0, 0, 0],
      "WEBPVP8L",
      [0, 0, 0, 0, 0x2f],
      [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255],
      [0, 0, 0, 0, 0],
    );
    assert.deepEqual(imageSize(vp8l), { width: 2100, height: 5460 });
    const vp8 = bytes(
      "RIFF",
      [0, 0, 0, 0],
      "WEBPVP8 ",
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0x34, 0x08, 0x78, 0x05],
      [0, 0],
    );
    assert.deepEqual(imageSize(vp8), { width: 2100, height: 1400 });
  });

  test("PNG and a JPEG whose frame header follows a metadata segment", () => {
    const png = bytes(
      [0x89],
      "PNG",
      [13, 10, 26, 10, 0, 0, 0, 13],
      "IHDR",
      [0, 0, 0x0b, 0xb8, 0, 0, 0x07, 0xd0],
    );
    assert.deepEqual(imageSize(png), { width: 3000, height: 2000 });
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe1, 0, 6, 1, 2, 3, 4], // APP1, 4 bytes of payload
      [0xff, 0xc0, 0, 17, 8, 0x0a, 0xf0, 0x0a, 0xf0, 3],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
    assert.deepEqual(imageSize(jpeg), { width: 2800, height: 2800 });
  });

  test("anything else is unknown", () => {
    assert.equal(imageSize(bytes("%PDF-1.7")), null);
  });
});

describe("which files become scenes, and where", () => {
  test("images only, without tokens or handouts", () => {
    assert.ok(isSceneImage("Pack/Chapter 01/01-MAPS/WEBP/01-Hall.webp"));
    assert.ok(isSceneImage("Pack/00-TITLE/00-Title Screen.jpg"));
    assert.ok(!isSceneImage("Pack/Chapter 01/01-MAPS/WEBP/TOK-Truck-1120x560.webp"));
    assert.ok(!isSceneImage("Pack/Chapter 01/02-CREATURES TOKENS/Ghoul.webp"));
    assert.ok(!isSceneImage("Pack/Chapter 01/03-HANDOUTS-ADJ/ENG-WEBP/Letter.webp"));
    assert.ok(!isSceneImage("Pack/Book I.pdf"));
  });

  test("folders drop format-only levels; the name is the file's", () => {
    const path = "Pack/Chapter 03-1893/01-MAPS/WEBP-lower file size/05-Smith Apartment-DAY.webp";
    assert.deepEqual(sceneFolderPath(path), ["Pack", "Chapter 03-1893"]);
    assert.deepEqual(
      sceneFolderPath("Pack/00-Train/02-Train MAPS-Separate Car/WEBP/01a-Loco.webp"),
      ["Pack", "00-Train", "02-Train MAPS-Separate Car"],
    );
    assert.deepEqual(sceneFolderPath("a/b/c/d/e/f/map.png").length, 4);
    assert.equal(sceneName(path), "05-Smith Apartment-DAY");
  });

  test("a manual is recognised by its name", () => {
    assert.ok(isMapKeyManual("Pack/USER MANUAL-Pack.pdf"));
    assert.ok(!isMapKeyManual("Pack/II - Through the Alps.pdf"));
  });
});

describe("parseMapKey", () => {
  // One map entry as a manual lays it out: number + title, size below, cell
  // label below that, all in one column.
  const entry = (x: number, y: number, n: string, name: string, size: string, cell: string) => [
    { str: n, x: x + 11, y },
    { str: name, x: x + 29, y: y - 3 },
    { str: size, x, y: y - 106 },
    { str: cell[0], x: x - 1, y: y - 157 },
    { str: cell.slice(2), x: x - 1, y: y - 150 },
  ];

  test("pairs each size with its title and cell label by position", () => {
    const key = parseMapKey([
      [
        ...entry(34, 514, "01", "Grand Hall", "4830 x 6930", "S 210 px"),
        ...entry(203, 267, "05", "Reading Room", "8400 x 8400", "M 140 px"),
        { str: "Where encounters are made", x: 213, y: 298 },
      ],
    ]);
    assert.deepEqual(key, [
      { name: "Grand Hall", width: 4830, height: 6930, cell: 210 },
      { name: "Reading Room", width: 8400, height: 8400, cell: 140 },
    ]);
  });
});

describe("sceneGrid", () => {
  const key = [
    { name: "Reading Room", width: 8400, height: 8400, cell: 140 },
    { name: "Wood Cottage", width: 6300, height: 6300, cell: 210 },
    { name: "Village", width: 6300, height: 6300, cell: 140 },
    { name: "Island", width: 8400, height: 7000, cell: 70 },
    { name: "Station Platform", width: 4200, height: 8400, cell: 210 },
  ];

  test("the key's entry named in the file, of the file's size", () => {
    const size = { width: 6300, height: 6300 };
    assert.equal(sceneGrid("P/C/12b-Wood Cottage-NIGHT.webp", size, key).size, 210);
    assert.equal(sceneGrid("P/C/08-Village.webp", size, key).size, 140);
    assert.equal(
      sceneGrid("P/C/16a-Island-GF-DAY.webp", { width: 8400, height: 7000 }, key).size,
      70,
    );
  });

  test("a size the key gives one cell, and a named variant of another size", () => {
    assert.equal(
      sceneGrid("P/T/05-Station Plaform-Venice.webp", { width: 4200, height: 8400 }, key).size,
      210,
    );
    assert.equal(
      sceneGrid("P/C/05c-Reading Room-GF-1F.webp", { width: 16800, height: 8400 }, key).size,
      140,
    );
  });

  test("unkeyed: the folder's keyed maps of that size, then divisibility", () => {
    const size = { width: 8400, height: 8400 };
    assert.equal(
      sceneGrid("P/D/14-Dylath.webp", size, [], [{ size, cell: 210 }, { size, cell: 210 }, { size, cell: 140 }]).size,
      210,
    );
    assert.equal(sceneGrid("P/D/x.webp", { width: 2800, height: 2100 }).size, 140);
    assert.deepEqual(sceneGrid("P/D/x.webp", { width: 1892, height: 3992 }), {
      gridless: true,
      size: 100,
    });
  });

  test("title and landing pages are gridless", () => {
    assert.equal(
      sceneGrid("P/00-TITLE & LANDING PAGES/LP-1923.webp", { width: 2100, height: 1400 }, key).gridless,
      true,
    );
  });
});

describe("planScenes", () => {
  test("plans images only, with folders, sizes and grids", () => {
    const plans = planScenes(
      [
        { path: "Pack/Ch 1/01-MAPS/01-Hall.webp", size: { width: 4200, height: 4200 } },
        { path: "Pack/Ch 1/01-MAPS/TOK-Truck.webp", size: { width: 1120, height: 560 } },
      ],
      [{ name: "Hall", width: 4200, height: 4200, cell: 140 }],
    );
    assert.deepEqual(plans, [
      {
        path: "Pack/Ch 1/01-MAPS/01-Hall.webp",
        name: "01-Hall",
        folders: ["Pack", "Ch 1"],
        width: 4200,
        height: 4200,
        grid: { gridless: false, size: 140 },
      },
    ]);
  });
});

describe("handouts and creature tokens", () => {
  test("English handouts, journaled by the folder holding them", () => {
    const path = "Pack/Chapter 01-LON/03-HANDOUTS-ADJ/ENG-WEBP/05-TELEGRAM-A.webp";
    assert.ok(isHandoutImage(path));
    assert.ok(!isHandoutImage("Pack/Chapter 01-LON/03-HANDOUTS-ADJ/FR-WEBP/05-TELEGRAM-A.webp"));
    assert.ok(!isHandoutImage("Pack/Chapter 01-LON/01-MAPS/01-Hall.webp"));
    assert.deepEqual(handoutJournal(path), {
      name: "Chapter 01-LON",
      folders: ["Pack"],
    });
  });

  test("a token's creature, variant and matching key", () => {
    assert.ok(isCreatureToken("Pack/Chapter 10/02-CREATURES TOKENS/TOK-LLOIGOR A-1260x1260.webp"));
    assert.ok(!isCreatureToken("Pack/Chapter 10/01-MAPS/TOK-Truck-1120x560.webp"));
    assert.deepEqual(
      creatureTokenName("P/C/02-CREATURES TOKENS/TOK-LLOIGOR A-1260x1260.webp"),
      { name: "LLOIGOR", variant: "A" },
    );
    assert.deepEqual(
      creatureTokenName("P/C/02-CREATURES TOKENS/TOK-Cudoviste A 500x500.png"),
      { name: "Cudoviste", variant: "A" },
    );
    assert.deepEqual(
      creatureTokenName("P/C/02-CREATURES TOKENS/TOK-Fire Vampire-560x560.webp"),
      { name: "Fire Vampire", variant: "" },
    );
    assert.equal(creatureKey("LLOIGOR"), creatureKey("Sample Lloigor"));
    assert.equal(creatureKey("Shantak"), creatureKey("Shantaks Four"));
    assert.equal(creatureKey("Fill"), creatureKey("Fill (ur-rinna dauthi)"));
    assert.equal(creatureKey("Anatolian Dragon"), creatureKey("The Anatolian Dragon"));
    assert.notEqual(creatureKey("Soldier"), creatureKey("Faceless Soldiers"));
  });

  test("a token's footprint follows its chapter's grid", () => {
    assert.deepEqual(tokenCells({ width: 2730, height: 1890 }, [210]), { width: 13, height: 9 });
    assert.deepEqual(tokenCells({ width: 560, height: 560 }, [210, 140]), { width: 4, height: 4 });
    assert.deepEqual(tokenCells({ width: 500, height: 250 }, [210]), { width: 2, height: 1 });
  });
});
