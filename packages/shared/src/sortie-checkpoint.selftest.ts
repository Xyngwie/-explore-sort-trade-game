import assert from "node:assert/strict";
import {
  HUB_SAVE_LEGACY_STORAGE_KEY,
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  createHubSave,
  loadHubSaveFromLocalStorage,
  serializeHubSave,
} from "./hub-save";
import {
  SORTIE_CHECKPOINT_KEY,
  SORTIE_CHECKPOINT_TEMP_KEY,
  SORTIE_PAUSE_LABEL,
  checkpointKindOnHide,
  clearSortieCheckpoint,
  discardSortieCheckpoint,
  exploreBackAction,
  exploreBootFromCheckpoint,
  exploreHubUrl,
  isSortieDoneMark,
  markDoneIfZeroContainersSaved,
  readSortieCheckpoint,
  resolveModuleBaseUrl,
  shouldMarkDoneAfterExploreSave,
  shouldMarkDoneAfterTradeWrite,
  sortieFrameShouldTick,
  sortiePausedAfter,
  sortBackAction,
  writeHideCheckpoint,
  writeSortieCheckpoint,
  writeSortieDoneMark,
  writeSortieSnapshot,
} from "./index";

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

assert.equal(SORTIE_PAUSE_LABEL, "一時停止中 — タップで再開");
assert.equal(exploreHubUrl(), resolveModuleBaseUrl("trade"));

{
  const store = mem();
  assert.equal(readSortieCheckpoint(store).status, "absent");
  assert.equal(exploreBootFromCheckpoint(readSortieCheckpoint(store)).action, "continue");
  assert.equal(store.getItem(SORTIE_CHECKPOINT_TEMP_KEY), null);
}

{
  // A cut after the temp key, before the pointer switches, keeps the current save.
  const store = mem();
  assert.equal(
    writeSortieCheckpoint({ v: 1, kind: "sortie", body: { timeLeft: 180 } }, store),
    true,
  );
  assert.equal(store.getItem(SORTIE_CHECKPOINT_TEMP_KEY), null);
  const flaky = {
    getItem: (key: string) => store.getItem(key),
    removeItem: (key: string) => store.removeItem(key),
    setItem(key: string, value: string) {
      if (key === SORTIE_CHECKPOINT_KEY) throw new Error("cut");
      store.setItem(key, value);
    },
  };
  assert.equal(
    writeSortieCheckpoint({ v: 1, kind: "sortie", body: { timeLeft: 1 } }, flaky),
    false,
  );
  const read = readSortieCheckpoint(store);
  assert.equal(read.status, "ok");
  assert.equal(read.status === "ok" && read.record.kind, "sortie");
  assert.deepEqual(read.status === "ok" && read.record.kind === "sortie" ? read.record.body : null, {
    timeLeft: 180,
  });
  assert.equal(store.getItem(SORTIE_CHECKPOINT_TEMP_KEY), null, "temp key is not a second save");

  store.setItem(
    SORTIE_CHECKPOINT_TEMP_KEY,
    JSON.stringify({ v: 1, kind: "sortie", body: { timeLeft: 2 } }),
  );
  const still = readSortieCheckpoint(store);
  assert.deepEqual(still.status === "ok" && still.record.kind === "sortie" ? still.record.body : null, {
    timeLeft: 180,
  });
  store.removeItem(SORTIE_CHECKPOINT_TEMP_KEY);
}

{
  const store = mem();
  store.setItem(SORTIE_CHECKPOINT_KEY, "{");
  assert.equal(readSortieCheckpoint(store).status, "unreadable");
  assert.equal(exploreBootFromCheckpoint(readSortieCheckpoint(store)).action, "hub");
  store.setItem(SORTIE_CHECKPOINT_KEY, JSON.stringify({ v: 99, kind: "sortie", body: {} }));
  assert.equal(readSortieCheckpoint(store).status, "unreadable");
  store.setItem(SORTIE_CHECKPOINT_KEY, JSON.stringify({ v: 1, kind: "other" }));
  assert.equal(readSortieCheckpoint(store).status, "unreadable");
  discardSortieCheckpoint(store);
  assert.equal(readSortieCheckpoint(store).status, "absent");
}

{
  // Old HubSave with no checkpoint key still loads.
  const store = mem();
  const legacy = {
    v: 2,
    savedAt: "2026-09-02T00:00:00.000Z",
    hub: { credits: 9, materials: 1, fleet: [], circuits: [] },
  };
  store.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, JSON.stringify(legacy));
  assert.equal(store.getItem(SORTIE_CHECKPOINT_KEY), null);
  const loaded = loadHubSaveFromLocalStorage(store);
  assert.ok(loaded);
  assert.equal(loaded!.hub.credits, 9);
  assert.equal(loaded!.hub.materials, 1);
  assert.equal(readSortieCheckpoint(store).status, "absent");
  assert.equal(exploreBootFromCheckpoint(readSortieCheckpoint(store)).action, "continue");

  const current = mem();
  current.setItem(
    HUB_SAVE_STORAGE_KEY,
    serializeHubSave(createHubSave({ ...INITIAL_HUB, credits: 42 })),
  );
  const again = loadHubSaveFromLocalStorage(current);
  assert.equal(again!.hub.credits, 42);
  assert.equal(readSortieCheckpoint(current).status, "absent");
}

{
  const body = { timeLeft: 123.5, leader: { pos: { x: 111, y: 222 }, hp: 40 } };
  const store = mem();
  assert.equal(writeSortieSnapshot("sortie", body, store), true);
  const boot = exploreBootFromCheckpoint(readSortieCheckpoint(store));
  assert.equal(boot.action, "sortie");
  assert.deepEqual(boot.action === "sortie" ? boot.body : null, body);

  const resultBody = {
    salvagedContainers: 2,
    heading: "生還",
    rescueFeeCredits: 15,
    wrecks: [{ id: "wing-a", pos: { x: 8, y: 9 } }],
  };
  assert.equal(writeSortieSnapshot("result", resultBody, store), true);
  const resultBoot = exploreBootFromCheckpoint(readSortieCheckpoint(store));
  assert.equal(resultBoot.action, "result");
  assert.notEqual(resultBoot.action, "hub");
  assert.deepEqual(resultBoot.action === "result" ? resultBoot.body : null, resultBody);

  assert.equal(writeSortieDoneMark(store), true);
  const raw = store.getItem(SORTIE_CHECKPOINT_KEY);
  assert.deepEqual(JSON.parse(raw!), { v: 1, kind: "done" });
  assert.equal(isSortieDoneMark(store), true);
  assert.equal(exploreBootFromCheckpoint(readSortieCheckpoint(store)).action, "hub");
  assert.equal(writeHideCheckpoint("sortie", { timeLeft: 1 }, store), false);
  assert.equal(writeHideCheckpoint("result", { salvagedContainers: 1 }, store), false);
  assert.deepEqual(JSON.parse(store.getItem(SORTIE_CHECKPOINT_KEY)!), { v: 1, kind: "done" });

  clearSortieCheckpoint(store);
  assert.equal(readSortieCheckpoint(store).status, "absent");
  assert.equal(writeSortieSnapshot("result", resultBody, store), true);
  assert.equal(writeHideCheckpoint("sortie", body, store), true);
  const replaced = exploreBootFromCheckpoint(readSortieCheckpoint(store));
  assert.equal(replaced.action, "sortie");
  assert.deepEqual(replaced.action === "sortie" ? replaced.body : null, body);
}

{
  assert.equal(checkpointKindOnHide("sortie", false), "sortie");
  assert.equal(checkpointKindOnHide("result", false), "result");
  assert.equal(checkpointKindOnHide("briefing", false), "none");
  assert.equal(checkpointKindOnHide("sortie", true), "none");
  assert.equal(checkpointKindOnHide("result", true), "none");
  assert.equal(sortieFrameShouldTick("sortie", false), true);
  assert.equal(sortieFrameShouldTick("sortie", true), false);
  assert.equal(sortieFrameShouldTick("result", false), false);
  let paused = false;
  paused = sortiePausedAfter("hidden", paused);
  assert.equal(paused, true);
  paused = sortiePausedAfter("visible", paused);
  assert.equal(paused, true);
  paused = sortiePausedAfter("tap", paused);
  assert.equal(paused, false);
}

{
  assert.deepEqual(exploreBackAction("sortie"), { block: true, wipe: false });
  assert.deepEqual(exploreBackAction("briefing"), { block: false, wipe: false });
  assert.deepEqual(exploreBackAction("result"), { block: false, wipe: false });
  const store = mem();
  assert.deepEqual(sortBackAction(store), { block: true, wipe: false });
  writeSortieDoneMark(store);
  assert.deepEqual(sortBackAction(store), { block: false, wipe: false });
}

{
  assert.equal(shouldMarkDoneAfterExploreSave(0, "saved"), true);
  assert.equal(shouldMarkDoneAfterExploreSave(0, "already_applied"), true);
  assert.equal(shouldMarkDoneAfterExploreSave(0, "no_save"), false);
  assert.equal(shouldMarkDoneAfterExploreSave(0, "write_refused"), false);
  assert.equal(shouldMarkDoneAfterExploreSave(0, "false"), false);
  assert.equal(shouldMarkDoneAfterExploreSave(1, "saved"), false);
  assert.equal(shouldMarkDoneAfterExploreSave(2, "already_applied"), false);
  const store = mem();
  assert.equal(markDoneIfZeroContainersSaved(0, "saved", store), true);
  assert.equal(isSortieDoneMark(store), true);
  clearSortieCheckpoint(store);
  assert.equal(markDoneIfZeroContainersSaved(0, "no_save", store), false);
  assert.equal(markDoneIfZeroContainersSaved(0, "write_refused", store), false);
  assert.equal(markDoneIfZeroContainersSaved(3, "saved", store), false);
  assert.equal(isSortieDoneMark(store), false);

  assert.equal(
    shouldMarkDoneAfterTradeWrite({
      saved: true,
      depositUnopenedContainers: 2,
      importMaterials: 0,
      yieldBag: false,
    }),
    true,
  );
  assert.equal(
    shouldMarkDoneAfterTradeWrite({
      saved: true,
      depositUnopenedContainers: 0,
      importMaterials: 4,
      yieldBag: false,
    }),
    true,
  );
  assert.equal(
    shouldMarkDoneAfterTradeWrite({
      saved: true,
      depositUnopenedContainers: 0,
      importMaterials: 0,
      yieldBag: true,
    }),
    true,
  );
  assert.equal(
    shouldMarkDoneAfterTradeWrite({
      saved: false,
      depositUnopenedContainers: 2,
      importMaterials: 4,
      yieldBag: true,
    }),
    false,
  );
  assert.equal(
    shouldMarkDoneAfterTradeWrite({
      saved: true,
      depositUnopenedContainers: 0,
      importMaterials: 0,
      yieldBag: false,
    }),
    false,
  );
}

console.log("shared sortie-checkpoint.selftest ok");
