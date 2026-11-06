/**
 * One owner for every finger / pointer on the canvas (docs/CANVAS_UNIFIED_V0.md §13).
 *
 * Buttons (CanvasUI presses) and raw boards (e.g. INVADE's BoardGesture) used to
 * count their pointers separately, so a press on a button survived a second
 * finger that landed on a board. The router sees every contact first:
 * - one contact: it goes to the board under it (raw) or to the buttons (ui);
 * - more fingers on the same board: they join it (pinch stays the board's own rule);
 * - any other mix (button + board, button + button, board + button): every press
 *   and board gesture is cancelled and nothing acts until all contacts are lifted.
 */
import type { CanvasUI, Point, RawPointerHandler, RawPointerSample } from "./core";

export type ContactSample = RawPointerSample & { primary: boolean };
type Kind = "ui" | "raw" | "ignored";

export class ContactRouter {
  private contacts = new Map<number, { kind: Kind; type: string }>();
  private board: RawPointerHandler | null = null;
  constructor(private readonly ui: CanvasUI) {}

  get size(): number { return this.contacts.size; }
  kindOf(id: number): Kind | null { return this.contacts.get(id)?.kind ?? null; }

  down(s: ContactSample): void {
    // isPrimary: the browser says no other pointer of this type is down → forget stale ones of that type,
    // cancelling what they still hold first (a button press stays drawn and blocks the wheel; a board
    // would read the next touch as a pinch).
    if (s.primary) {
      let boardStale = false;
      for (const [id, c] of this.contacts) {
        if (c.type !== s.type) continue;
        if (c.kind === "ui") this.ui.pointerCancel(id);
        else if (c.kind === "raw") boardStale = true;
        this.contacts.delete(id);
      }
      if (boardStale) this.board?.cancel();
    }
    if (this.board && ![...this.contacts.values()].some((c) => c.kind === "raw")) this.board = null;
    const p: Point = { x: s.x, y: s.y };
    if (this.contacts.size === 0) {
      const raw = this.ui.rawAt(p);
      if (raw) { this.contacts.set(s.id, { kind: "raw", type: s.type }); this.board = raw; raw.down(s); return; }
      if (s.type === "mouse" && s.button !== 0) { this.contacts.set(s.id, { kind: "ignored", type: s.type }); return; }
      this.contacts.set(s.id, { kind: "ui", type: s.type });
      this.ui.pointerDown(s.id, p, true);
      return;
    }
    const all = [...this.contacts.values()];
    if (s.type !== "mouse" && this.board && all.every((c) => c.kind === "raw")) {
      this.contacts.set(s.id, { kind: "raw", type: s.type });
      this.board.down(s); // pinch: the board's own multi-touch rules
      return;
    }
    // Mixed contacts: cancel everything; every finger is ignored until all are lifted.
    this.ui.pointerCancel();
    this.board?.cancel();
    this.board = null;
    for (const c of this.contacts.values()) c.kind = "ignored";
    this.contacts.set(s.id, { kind: "ignored", type: s.type });
  }
  move(s: RawPointerSample): void {
    const c = this.contacts.get(s.id);
    if (!c) return;
    if (c.kind === "raw") this.board?.move(s);
    else if (c.kind === "ui") this.ui.pointerMove(s.id, { x: s.x, y: s.y });
  }
  up(s: RawPointerSample): void {
    const c = this.contacts.get(s.id);
    if (!c) return;
    if (c.kind === "raw") {
      this.board?.up(s);
      if (s.type !== "mouse" || s.buttons === 0) this.contacts.delete(s.id);
    } else {
      if (c.kind === "ui") this.ui.pointerUp(s.id, { x: s.x, y: s.y });
      if (s.type !== "mouse" || s.buttons === 0) this.contacts.delete(s.id);
    }
    if (![...this.contacts.values()].some((x) => x.kind === "raw")) this.board = null;
  }
  cancel(id: number): void {
    const c = this.contacts.get(id);
    if (!c) return;
    if (c.kind === "raw") {
      this.board?.cancel();
      this.board = null;
      for (const [k, x] of this.contacts) if (x.kind === "raw") this.contacts.delete(k);
    } else {
      if (c.kind === "ui") this.ui.pointerCancel(id);
      this.contacts.delete(id);
    }
  }
  /** Capture lost while still pressed: drop a button press (boards keep pending taps after a release). */
  lostCapture(id: number): void {
    const c = this.contacts.get(id);
    if (c?.kind === "ui") { this.ui.pointerCancel(id); this.contacts.delete(id); }
  }
  cancelAll(): void {
    this.ui.pointerCancel();
    this.board?.cancel();
    this.board = null;
    this.contacts.clear();
  }
  wheel(p: Point, deltaY: number): boolean {
    const raw = this.ui.rawAt(p);
    if (raw?.wheel) { raw.wheel(p, deltaY); return true; }
    this.ui.wheel(p, deltaY);
    return false;
  }
}
