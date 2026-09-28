import fs from "node:fs";

const path = "packages/sort/src/refine-legacy.ts";
const source = fs.readFileSync(path, "utf8");

const start = source.indexOf('export type PieceKind =');
const endMarker = 'export type PlayMode =';
const endStart = source.indexOf(endMarker, start);
if (start < 0 || endStart < 0) throw new Error("Could not locate PieceKind block");

// RefineLive follows PlayMode, so extract through the end of RefineLive.
const liveEndMarker = '\n};\n\nfunction mulberry32';
const end = source.indexOf(liveEndMarker, endStart);
if (end < 0) throw new Error("Could not locate RefineLive block");
const extracted = source.slice(start, end + 3);

const types = `import type { ExploreToSortPayload } from "@estg/shared";\n\n${extracted.replaceAll('export type PieceKind = "food" | "material" | "energy" | "junk";', 'export type PieceKind = "ammo" | "armor" | "power" | "junk";').replaceAll('"food",\n  "material",\n  "energy",', '"ammo",\n  "armor",\n  "power",').replaceAll('food: "食料",\n  material: "部品",\n  energy: "電力",', 'ammo: "弾薬",\n  armor: "装甲パーツ",\n  power: "電力パーツ",').replaceAll('food: number;\n  material: number;\n  energy: number;', 'ammo: number;\n  armor: number;\n  power: number;').replaceAll('import type { ExploreToSortPayload } from "@estg/shared";\n', '')}`;

const importBlock = `import {\n  type PieceKind,\n  type ClearedCounts,\n  type RefinePhase,\n  type Cell,\n  type PlayMode,\n  type RefineLive,\n  VALID_KINDS,\n  PIECE_LABEL_JA,\n} from "./refine-types";\n`;

const next = source.slice(0, start) + importBlock + source.slice(end);
fs.writeFileSync("packages/sort/src/refine-types.ts", types + "\n");
fs.writeFileSync(path, next);
console.log("Extracted PieceKind/ClearedCounts/RefineLive and related types to refine-types.ts");
