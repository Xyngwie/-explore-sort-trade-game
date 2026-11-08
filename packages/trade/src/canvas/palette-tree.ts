/**
 * Palette tree of the canvas HUB (docs/CANVAS_PALETTE_RESTRUCTURE.md, 2026-11-08).
 *
 * One palette = one logical screen on the same canvas: either a choice of the
 * next few actions (selection palette) or one piece of work (work palette).
 * Ids are the document's reference names, not URLs or save keys. Moving
 * between palettes never saves anything.
 */
export type PaletteId =
  | "H"
  | "T" | "B" | "BR" | "BC" | "V" | "VS" | "VR"
  | "S"
  | "M" | "MM" | "MN" | "MC" | "MF" | "MD" | "MS" | "MW" | "MR" | "MV" | "MQ"
  | "C" | "CI" | "CD" | "CC" | "CB" | "CU" | "CS" | "EQ"
  | "I" | "IT"
  | "A" | "AI" | "AH" | "AL" | "AS";

export const PALETTE_TITLE: Record<PaletteId, string> = {
  H: "HUB",
  T: "売買", B: "買う", BR: "資源購入", BC: "未開封コンテナ購入", V: "売る", VS: "資源売却", VR: "レア在庫売却",
  S: "仕分",
  M: "整備", MM: "機体整備", MN: "新規機体", MC: "新品機体購入", MF: "新規機体製作", MD: "機体処分", MS: "機体分解", MW: "機体売却（残骸）", MR: "機体修理", MV: "残骸復活", MQ: "機体充電",
  C: "回路整備", CI: "所持回路", CD: "回路詳細", CC: "回路製作", CB: "回路購入", CU: "回路取り外し", CS: "回路売却", EQ: "装備回路",
  I: "侵略", IT: "出撃部隊",
  A: "所持資産", AI: "型付き在庫", AH: "資源履歴", AL: "ログ", AS: "署名（刻印）",
};

/** Default parent (used when a palette is opened directly, e.g. from a tab or a guide). */
export const PALETTE_PARENT: Record<Exclude<PaletteId, "H">, PaletteId> = {
  T: "H", B: "T", BR: "B", BC: "B", V: "T", VS: "V", VR: "V",
  S: "H",
  M: "H", MM: "M", MN: "MM", MC: "MN", MF: "MN", MD: "MM", MS: "MD", MW: "MD", MR: "MM", MV: "MM", MQ: "MM",
  C: "M", CI: "C", CD: "CI", CC: "C", CB: "C", CU: "C", CS: "C", EQ: "MM",
  I: "H", IT: "I",
  A: "H", AI: "A", AH: "A", AL: "A", AS: "A",
};

/** The default path from HUB to a palette (H → … → id). */
export function palettePath(id: PaletteId): PaletteId[] {
  const out: PaletteId[] = [id];
  let cur: PaletteId = id;
  while (cur !== "H") { cur = PALETTE_PARENT[cur]; out.unshift(cur); }
  return out;
}

/**
 * Where the user is. A child opened from a palette remembers that palette as
 * its parent (shared work such as 新品機体購入 from 買う or 新規機体 returns to the
 * branch it came from). Back goes one step; HUB goes straight to H.
 */
export class PaletteNav {
  private stack: PaletteId[] = ["H"];
  get current(): PaletteId { return this.stack[this.stack.length - 1]; }
  get depth(): number { return this.stack.length; }
  get parent(): PaletteId | null { return this.stack.length > 1 ? this.stack[this.stack.length - 2] : null; }
  /** Open a child of the current palette. */
  open(id: PaletteId): void { if (id !== this.current) this.stack.push(id); }
  /** Jump to a palette along its default path (tabs, guides, other scenes). */
  goTo(id: PaletteId): void { this.stack = palettePath(id); }
  back(): void { if (this.stack.length > 1) this.stack.pop(); }
  home(): void { this.stack = ["H"]; }
  path(): readonly PaletteId[] { return this.stack; }
}
