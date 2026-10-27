/** Optional browser adapter. Reducer selftests/legacy/debug saves retain their existing API. */
import type { LogJSON } from "./play-log";
type Hooks = {
  operation(kind: string, context: LogJSON): void;
  blocked(): boolean;
  navigate(url: string, replace: boolean): void;
  sortie(world: LogJSON): void;
  settlement(nonce: string, payload: LogJSON): void;
  provider(fn: () => LogJSON): void;
};
let hooks: Hooks | null = null;
export function installPlayLogHooks(next: Hooks): void {
  hooks = next;
}
export function playLogBlocked(): boolean {
  return hooks?.blocked() ?? false;
}
export function playLogNavigate(url: string, replace = false): void {
  if (hooks) hooks.navigate(url, replace);
  else if (replace) location.replace(url);
  else location.assign(url);
}
export function recordPlayLogSortie(world: unknown): void {
  hooks?.sortie(JSON.parse(JSON.stringify(world)) as LogJSON);
}
export function recordPlayLogSettlement(nonce: string, payload: unknown): void {
  hooks?.settlement(nonce, JSON.parse(JSON.stringify(payload)) as LogJSON);
}
export function setPlayLogCheckpointProvider(fn: () => unknown): void {
  hooks?.provider(() => JSON.parse(JSON.stringify(fn())) as LogJSON);
}
export function setPlayLogOperation(
  kind: string,
  context: LogJSON = null,
): void {
  hooks?.operation(kind, context);
}
export function playLogRecording(): boolean {
  return hooks !== null;
}
