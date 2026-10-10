import { readFileSync } from "node:fs";
import {
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  createHubSave,
  createOwnedMech,
  deserializeHubSave,
  serializeHubSave,
  writeSortieDoneMark,
} from "@estg/shared";
import { sortPopstateAction } from "./back-guard";

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? "assertion failed");
}

function mem(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

{
  const fleet = [createOwnedMech("mech_gen1", { instanceId: "s1", durability: 66 })];
  const store = mem();
  store.setItem(
    HUB_SAVE_STORAGE_KEY,
    serializeHubSave(createHubSave({ ...INITIAL_HUB, fleet })),
  );
  const action = sortPopstateAction(store);
  assert(action.block === true && action.wipe === false, "sort back blocks without a wipe");
  const saved = deserializeHubSave(store.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert(saved!.hub.fleet[0]!.durability === 66, "durability unchanged");
  assert(saved!.hub.fleet[0]!.status === "operational", "not destroyed");

  assert(writeSortieDoneMark(store) === true, "done mark writes");
  const open = sortPopstateAction(store);
  assert(open.block === false && open.wipe === false, "done mark enables back");
  const after = deserializeHubSave(store.getItem(HUB_SAVE_STORAGE_KEY)!);
  assert(after!.hub.fleet[0]!.durability === 66, "still not wiped");
}

{
  const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  assert(main.includes("sortPopstateAction") || main.includes("armSortBackTrap"), "sort wires the back guard");
  assert(!main.includes("allDestroyed"), "sort back does not write all-destroyed");
  assert(!main.includes("resolveForcedBackWipe"), "sort does not wipe");
}

console.log("sort back-guard.selftest ok");
