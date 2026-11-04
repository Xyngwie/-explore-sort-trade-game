/**
 * Start scene: the user name, entered once before play (CANVAS-Q1).
 * docs/CANVAS_SHELL_V0.md §4.
 *
 * The name IS the existing hangar 「署名」 (`wreckline.craftSignature.v0`),
 * which circuits are engraved with automatically. It goes through the existing
 * set-once function `saveCraftSignatureOnce`, so a confirmed name can never be
 * changed from here (the input is not even shown once it is confirmed).
 * The only HTML control is the text field; it is hidden and blurred on start.
 */
import { CANVAS_THEME, CIRCUIT_EDITOR_NAME_MAX, sanitizeEditorName, type CanvasUI, type FrameInfo, type Rect } from "@estg/shared";
import { isCraftSignatureLocked, loadCraftSignature, saveCraftSignatureOnce } from "../hangar";

export type IdentityStore = Pick<Storage, "getItem" | "setItem">;
export type StartOutcome = { ok: true; name: string } | { ok: false; notice: string };

export const NAME_LABEL = "ユーザーネーム（回路の刻印に使われます）";
export const NAME_LOCKED_NOTE = "名前は確定済みです。変更できません。";
export const NAME_FIRST_NOTE = "開始すると名前は確定し、あとから変更できません。";

/** Pure start rule (selftested): locked → keep; else require a name and lock it once. */
export function startWithName(draft: string, store?: IdentityStore | null): StartOutcome {
  if (isCraftSignatureLocked(store)) return { ok: true, name: loadCraftSignature(store) };
  const name = sanitizeEditorName(draft);
  // CANVAS-D1 (神宮決定 2026-11-04): an empty name cannot start (no silent default name).
  if (!name) return { ok: false, notice: "名前を入力してください。" };
  const r = saveCraftSignatureOnce(name, store);
  if (r.ok) return { ok: true, name: r.signature };
  if (r.alreadySet) return { ok: true, name: r.signature };
  return { ok: false, notice: "名前を保存できませんでした。もう一度「開始」を押してください。" };
}

export type StartLayout = { column: Rect; title: Rect; label: Rect; input: Rect; note: Rect; start: Rect; notice: Rect };
export function layoutStart(frame: Pick<FrameInfo, "width" | "height" | "insets">): StartLayout {
  const { width: W, height: H, insets } = frame;
  const avail = Math.max(0, W - insets.left - insets.right);
  const cw = Math.min(avail, 480);
  const x = insets.left + (avail - cw) / 2 + 16;
  const w = cw - 32;
  // Upper part of the screen so the field stays visible above a soft keyboard.
  const top = insets.top + Math.max(24, Math.min(120, (H - insets.top - insets.bottom) * 0.12));
  const title: Rect = { x, y: top, w, h: 56 };
  const label: Rect = { x, y: title.y + title.h + 16, w, h: 22 };
  const input: Rect = { x, y: label.y + label.h + 6, w, h: 48 };
  const note: Rect = { x, y: input.y + input.h + 6, w, h: 20 };
  const start: Rect = { x, y: note.y + note.h + 16, w, h: 52 };
  const notice: Rect = { x, y: start.y + start.h + 10, w, h: 22 };
  return { column: { x: x - 16, y: 0, w: cw, h: H }, title, label, input, note, start, notice };
}

export class StartScene {
  draft = "";
  notice: string | null = null;
  constructor(private readonly onStart: (name: string) => void, private readonly store?: IdentityStore | null) {}
  get locked(): boolean { return isCraftSignatureLocked(this.store); }
  get lockedName(): string { return loadCraftSignature(this.store); }
  start(): void {
    const r = startWithName(this.draft, this.store);
    if (r.ok) { this.notice = null; this.onStart(r.name); }
    else this.notice = r.notice;
  }
  draw(ui: CanvasUI, frame: FrameInfo): void {
    const ctx = ui.context;
    const L = layoutStart(frame);
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, frame.width, frame.height);
    ui.text("WRECKLINE", L.title.x, L.title.y + 20, { size: 26, weight: 700 });
    ui.text("BASE HUB（canvas 試作・第1段階）", L.title.x, L.title.y + 46, { size: 13, color: CANVAS_THEME.muted, maxW: L.title.w });
    ui.text(NAME_LABEL, L.label.x, L.label.y + L.label.h / 2, { size: 13, color: CANVAS_THEME.muted, maxW: L.label.w });
    if (this.locked) {
      ui.panel(L.input, { radius: 8 });
      ui.text(this.lockedName, L.input.x + 12, L.input.y + L.input.h / 2, { size: 17, weight: 600, maxW: L.input.w - 24 });
      ui.text(NAME_LOCKED_NOTE, L.note.x, L.note.y + L.note.h / 2, { size: 12, color: CANVAS_THEME.faint, maxW: L.note.w });
    } else {
      // The HTML text field is laid over L.input (see app.ts); draw its frame only.
      ui.panel(L.input, { radius: 8, fill: CANVAS_THEME.bg, edge: "#484f58" });
      ui.text(`${NAME_FIRST_NOTE}（${CIRCUIT_EDITOR_NAME_MAX}文字まで）`, L.note.x, L.note.y + L.note.h / 2, { size: 12, color: CANVAS_THEME.faint, maxW: L.note.w });
    }
    ui.button("start:go", L.start, "開始", { variant: "primary", fontSize: 17, onActivate: () => this.start() });
    if (this.notice) ui.text(this.notice, L.notice.x, L.notice.y + L.notice.h / 2, { size: 13, color: "#ff8b8b", maxW: L.notice.w });
  }
}
