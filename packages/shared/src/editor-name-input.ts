import { CIRCUIT_EDITOR_NAME_MAX } from "./circuit-board";

/**
 * Characters that cannot be stored in an editor name / craft signature.
 * Newlines are in this set. A single-line input would otherwise keep only
 * the first line of a paste; callers flatten the clipboard before insert.
 */
const EDITOR_NAME_DROPPED = /[\u0000-\u001f|]/g;

/** Drop characters that `sanitizeEditorName` would drop. Does not trim or slice. */
export function editorNameDraftFromClipboard(raw: string): string {
  return raw.replace(EDITOR_NAME_DROPPED, "");
}

/** Live field limit. Does not trim, so a trailing space can still be typed. */
export function clampEditorNameDraft(raw: string): string {
  return raw.replace(EDITOR_NAME_DROPPED, "").slice(0, CIRCUIT_EDITOR_NAME_MAX);
}

function clampIndex(n: number, len: number): number {
  if (!Number.isFinite(n)) return len;
  return Math.max(0, Math.min(len, Math.floor(n)));
}

/**
 * Insert a paste into a name field.
 * Newlines are removed rather than used as a cutoff, so the 2nd line and
 * after are kept. The result is clamped to the engraved-name limit.
 */
export function insertEditorNamePaste(
  current: string,
  selectionStart: number,
  selectionEnd: number,
  pasted: string,
): { value: string; caret: number } {
  const text = editorNameDraftFromClipboard(pasted);
  const start = clampIndex(selectionStart, current.length);
  const end = Math.max(start, clampIndex(selectionEnd, current.length));
  const merged = current.slice(0, start) + text + current.slice(end);
  const value = clampEditorNameDraft(merged);
  const caret = Math.min(value.length, start + text.length);
  return { value, caret };
}

/**
 * Bind a name field so Japanese IME and multi-line paste both work.
 *
 * `maxlength` is intentionally not used. On iOS, a maxlength attribute
 * commits the converting text immediately, so dakuten (゛) and handakuten
 * (゜) never apply. This helper also refuses to write `value` while a
 * composition is open — assigning `value` commits the conversion.
 *
 * A paste that contains a newline is inserted in full. The browser's
 * default for `<input type="text">` would keep only the first line.
 */
export function bindEditorNameInput(
  el: HTMLInputElement,
  onDraft: (value: string) => void,
): { isComposing: () => boolean } {
  let composing = false;

  const publishClamped = () => {
    const next = clampEditorNameDraft(el.value);
    if (next !== el.value) {
      const caret = el.selectionStart ?? next.length;
      el.value = next;
      const pos = Math.min(next.length, caret);
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* some input states reject selection changes */
      }
    }
    onDraft(el.value);
  };

  el.addEventListener("compositionstart", () => {
    composing = true;
  });
  el.addEventListener("compositionend", () => {
    composing = false;
    publishClamped();
  });
  el.addEventListener("paste", (ev) => {
    const cd = ev.clipboardData?.getData("text/plain");
    if (cd == null || !/[\r\n]/.test(cd)) return;
    ev.preventDefault();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const inserted = insertEditorNamePaste(el.value, start, end, cd);
    el.value = inserted.value;
    try {
      el.setSelectionRange(inserted.caret, inserted.caret);
    } catch {
      /* ignore */
    }
    onDraft(el.value);
  });
  el.addEventListener("input", (ev) => {
    const inputEv = ev as InputEvent;
    if (composing || inputEv.isComposing) {
      onDraft(el.value);
      return;
    }
    publishClamped();
  });
  el.addEventListener("blur", () => {
    composing = false;
    publishClamped();
  });

  return { isComposing: () => composing };
}
