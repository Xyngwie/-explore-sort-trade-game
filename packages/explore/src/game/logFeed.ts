import type { LogLine, World } from "./types";
/** UI subscribers can retain arrivals without changing the checkpoint log cap. */
const feeds = new WeakMap<World, Set<(line: LogLine) => void>>();
export function subscribeLogFeed(world: World, listener: (line: LogLine) => void): () => void {
  let listeners = feeds.get(world);
  if (!listeners) { listeners = new Set(); feeds.set(world, listeners); }
  listeners.add(listener);
  return () => { listeners!.delete(listener); };
}
export function emitLogLine(world: World, line: LogLine): void {
  for (const listener of feeds.get(world) ?? []) listener(line);
}
