/** Keep native text selection/scrolling; consume the first outside gesture. */
export class LogSelectionGuard {
  private gesture: { id: number; x: number; y: number; inside: boolean; selected: boolean; moved: boolean; blocked: boolean; nativeSelection: boolean } | null = null;
  private suppressClick = false;
  private previouslySelected = false;
  constructor(private list: HTMLElement, private changed: (selected: boolean) => void) {
    // Registered before gameplay's window capture listener (pause/resume).
    window.addEventListener("pointerdown", this.down, true);
    window.addEventListener("pointermove", this.move, true);
    window.addEventListener("pointerup", this.up, true);
    window.addEventListener("pointercancel", this.cancel, true);
    window.addEventListener("click", this.click, true);
    document.addEventListener("selectionchange", this.selectionChanged);
    this.list.addEventListener("contextmenu", () => {
      if (this.gesture?.inside) this.gesture.nativeSelection = true;
    });
  }
  selected(): boolean {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return false;
    try { return s.getRangeAt(0).intersectsNode(this.list); } catch { return false; }
  }
  private stop(e: Event): void { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); }
  private clear(): void { window.getSelection()?.removeAllRanges(); this.changed(false); this.previouslySelected = false; }
  private down = (e: PointerEvent): void => {
    this.suppressClick = false;
    const inside = this.list.contains(e.target as Node), selected = this.selected();
    const blocked = selected && !inside;
    this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, inside, selected, moved: false, blocked, nativeSelection: false };
    if (blocked) { this.stop(e); this.clear(); this.suppressClick = true; }
  };
  private move = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    // Gesture discrimination only, not a gameplay distance. Native touch scroll
    // cancels the pointer; text/selection-handle drags continue normally.
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 4) g.moved = true;
    if (g.blocked) this.stop(e);
  };
  private up = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    if (g.blocked) { this.stop(e); this.suppressClick = true; }
    else if (g.inside && g.selected && !g.moved && !g.nativeSelection) {
      this.stop(e); this.clear(); this.suppressClick = true;
    } else if (g.inside && (this.selected() || g.selected)) this.suppressClick = true;
    this.gesture = null;
  };
  private cancel = (): void => { this.gesture = null; this.suppressClick = true; };
  private click = (e: MouseEvent): void => {
    if (this.suppressClick) { this.stop(e); this.suppressClick = false; return; }
    // Keyboard/synthetic clicks have no preceding pointer gesture.
    if (this.selected()) { this.stop(e); this.clear(); }
  };
  private selectionChanged = (): void => {
    const selected = this.selected();
    if (selected && this.gesture?.inside) this.gesture.nativeSelection = true;
    if (selected || this.previouslySelected) this.changed(selected);
    this.previouslySelected = selected;
  };
}
