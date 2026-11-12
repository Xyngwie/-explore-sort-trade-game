/**
 * Explore boot / re-sortie / result-save rules shared by the existing page
 * (`main.ts`) and the canvas scene (`canvas/explore-scene.ts`,
 * docs/CANVAS_UNIFIED_V0.md §14). Moved out of `main.ts` unchanged: same reads,
 * same writes, same order. No DOM.
 */
import {
  DEBUG_FIXTURE_ACTIVE,
  discardSortieCheckpoint,
  exploreBootFromCheckpoint,
  firstSortieError,
  markDoneIfZeroContainersSaved,
  normalizeHubSnapshot,
  parseTradeToExploreSearch,
  readSortieCheckpoint,
  resolveSortieSelection,
  saveHubSaveToLocalStorage,
  squadEquipmentError,
  type HubSnapshot,
} from "@estg/shared";
import type { World } from "./types";
import { bootstrapFromSearch, createWorld } from "./world";
import { directFieldEntryFromStorage } from "./directFieldEntry";
import { attachFieldPersistence } from "./fieldPersistence";
import { attachLostMechContext } from "./lostMechs";
import { invadeSquadSearch } from "./invadeSquad";
import { refillBeforeSortie } from "./preSortieAmmo";
import { resolveCommandUnlockMode } from "./unlockMode";
import { attachCircuitPlay, captainRescuer, refreshStarterCircuit } from "./circuitPlay";
import { worldFromCheckpointBody } from "./checkpoint";
import { checkpointSortieSearch, resortiePlan, resortieSearch } from "./resortie";
import { exploreReturnPayload, returnKindFromWorld, sortieIdForWorld, toExploreResult } from "./outcome";
import { saveSortieResultToHub, type DirectSaveResult } from "./hubDirectSave";
import { settleFriendlyFireOnce } from "./friendlyFireHistory";
import { inCampAura } from "./orders";
import { loadLineJa, unitLoad } from "./carry";
import { shieldHudText } from "./shields";
import { effectiveActivity } from "./power";

export type ReadHub = () => HubSnapshot | null;
export type ExploreBoot = ReturnType<typeof bootstrapFromSearch>;

export type ExploreEntry = {
  /** HubSave could not be written while building the direct field entry. */
  entrySaveRefused: boolean;
  entrySearch: string;
  /** Deploy query; 再出撃 replaces it with one rebuilt from HubSave. */
  bootSearch: string;
  /** M8: shortage line shown by the briefing 出撃 button. */
  preSortieAmmoNote: string;
  boot: ExploreBoot;
};

/** Entry query → boot (direct field entry, Invade squad, M3 top-up), as main.ts did at load. */
export function resolveExploreEntry(search: string, readHub: ReadHub): ExploreEntry {
  const entryCheckpoint = readSortieCheckpoint();
  let entrySaveRefused = false;
  let entrySearch = search;
  if (entryCheckpoint.status === "absent" || (entryCheckpoint.status === "ok" && entryCheckpoint.record.kind === "done")) {
    try { entrySearch = directFieldEntryFromStorage(entrySearch) ?? entrySearch; }
    catch { entrySaveRefused = true; }
  }
  let bootSearch = invadeSquadSearch(entrySearch, readHub()) ?? entrySearch;
  let preSortieAmmoNote = "";
  {
    // M3: an Invade sortie link (squad from HubSave) is a new sortie — top the
    // squad up from the stock first. Not on a 5-3 resume (checkpoint present).
    const hub0 = readHub();
    if (hub0 && bootSearch !== entrySearch && readSortieCheckpoint().status === "absent") {
      const ids = parseTradeToExploreSearch(bootSearch)?.deployedInstanceIds ?? [];
      const filled = refillBeforeSortie(hub0, ids);
      preSortieAmmoNote = filled.line;
      bootSearch = invadeSquadSearch(entrySearch, filled.hub) ?? bootSearch;
    }
  }
  return { entrySaveRefused, entrySearch, bootSearch, preSortieAmmoNote, boot: bootstrapFromSearch(bootSearch) };
}

/** New world + this front cell's left-behind mechs from HubSave (lostMechs.ts). */
export function makeExploreWorld(b: ExploreBoot, readHub: ReadHub): World {
  let hub = readHub();
  const mode = resolveCommandUnlockMode();
  // Q2: a captain with no circuit gets the false 1×1 (both modes; existing circuits never move).
  if (hub) {
    const next = refreshStarterCircuit(hub);
    if (next !== hub) {
      saveHubSaveToLocalStorage(normalizeHubSnapshot(next));
      hub = normalizeHubSnapshot(next);
    }
  }
  const world = attachLostMechContext(createWorld(b, { frontProgress: hub?.frontProgress ?? null }), hub);
  // Circuit effects are live in both modes; release-only extras follow `mode` (Q1/Q3c).
  attachCircuitPlay(world, hub, mode === "release");
  attachFieldPersistence(world, hub);
  return world;
}

export type ExploreSession = { world: World; paused: boolean; leaveForHub: boolean; bootSearch: string };

/** 5-3: checkpoint → resume the sortie (paused), show the result, or go to the hub. */
export function bootExploreSession(boot: ExploreBoot, bootSearch: string, make: (b: ExploreBoot) => World): ExploreSession {
  const read = readSortieCheckpoint();
  if (read.status === "unreadable") {
    discardSortieCheckpoint();
    return { world: make(boot), paused: false, leaveForHub: true, bootSearch };
  }
  const decision = exploreBootFromCheckpoint(read);
  if (decision.action === "hub") return { world: make(boot), paused: false, leaveForHub: true, bootSearch };
  if (decision.action === "continue") return { world: make(boot), paused: false, leaveForHub: false, bootSearch };
  const restored = worldFromCheckpointBody(decision.body);
  if (!restored) {
    discardSortieCheckpoint();
    return { world: make(boot), paused: false, leaveForHub: true, bootSearch };
  }
  const search = checkpointSortieSearch(bootSearch, restored.invadeSector);
  if (decision.action === "sortie") {
    restored.phase = "sortie";
    return { world: restored, paused: true, leaveForHub: false, bootSearch: search };
  }
  restored.phase = "result";
  restored.enemies = [];
  restored.bullets = [];
  restored.coverObjects = [];
  return { world: restored, paused: false, leaveForHub: false, bootSearch: search };
}

/** Briefing guard line (no save / intro / squad limits); empty = 出撃 allowed. */
export function sortieEquipmentNote(world: World, hub: HubSnapshot | null, entrySaveRefused: boolean): string {
  if (entrySaveRefused) return "戦場情報を保存できませんでした。保存を許可して再読込してください。";
  if (!hub) return DEBUG_FIXTURE_ACTIVE ? "" : "出撃機の保存データがありません。格納庫で新規ゲームを開始してください。";
  const introError = DEBUG_FIXTURE_ACTIVE ? "" : firstSortieError(hub, world.leader.instanceId);
  if (introError) return introError;
  const ids = world.deployedInstanceIds.length ? world.deployedInstanceIds : resolveSortieSelection(hub);
  const error = squadEquipmentError(hub, ids);
  return error === "squad_full" ? "出撃部隊の回路上限を超えています。格納庫で装備か出撃機を変更してください。" : error === "category_full" ? "武器種・特殊弾・盾回路・P盾回路は各機体に各1枚までです。格納庫で装備を変更してください。" : "";
}

export type ResortieResult =
  | { kind: "ok"; world: World; bootSearch: string; preSortieAmmoNote: string }
  | { kind: "refused"; note: string };

/**
 * 再出撃 (案 A + item 15): rebuild the squad from HubSave — the hangar's saved
 * sortie selection (deployable only, no size limit), with saved ammo /
 * durability / battery. No save → the previous sortie's mechs.
 */
export function resortieFrom(world: World, bootSearch: string, boot: ExploreBoot, make: (b: ExploreBoot) => World, currentAmmoNote: string): ResortieResult {
  const payload = exploreReturnPayload(world);
  if (payload && world.deployedInstanceIds.length > 0) {
    const plan = resortiePlan(bootSearch, world, payload);
    // M3: 再出撃 from the save tops the squad up from the stock first.
    const filled = plan.fromSave ? refillBeforeSortie(plan.hub, plan.ids) : { hub: plan.hub, line: "" };
    const next = resortieSearch(bootSearch, filled.hub, plan.ids);
    if (!next) {
      const error = squadEquipmentError(filled.hub, plan.ids);
      return { kind: "refused", note: error ? "回路の装備制限により再出撃できません。格納庫で装備か出撃機を変更してください。" : "再出撃できる機体がありません（格納庫で修理・受領してください）。" };
    }
    return { kind: "ok", world: make(bootstrapFromSearch(next.search)), bootSearch: next.search, preSortieAmmoNote: filled.line };
  }
  // No deployed mechs (Explore opened without a deploy URL): as before.
  return { kind: "ok", world: make(boot), bootSearch, preSortieAmmoNote: currentAmmoNote };
}

/** U9: save the result to HubSave once per world, before any result button can be pressed. */
export function ensureDirectSave(world: World, saves: WeakMap<World, DirectSaveResult>, storage: () => Storage): DirectSaveResult | null {
  if (world.phase !== "result") return null;
  try { settleFriendlyFireOnce(world, sortieIdForWorld(world, returnKindFromWorld(world)), storage()); } catch { /* storage denied: keep checkpoint counters */ }
  const done = saves.get(world);
  if (done) return done;
  const res = saveSortieResultToHub(world);
  saves.set(world, res);
  const status = res.status === "skipped" ? res.reason : res.status;
  markDoneIfZeroContainersSaved(toExploreResult(world).salvagedContainers, status);
  return res;
}

export function directSaveNoteText(res: DirectSaveResult | null): string {
  if (!res) return "";
  if (res.status === "saved") return "出撃結果を HubSave に保存しました（格納庫で再適用はしません）。";
  if (res.status === "already_applied") return "出撃結果は HubSave に保存済みです。";
  if (res.reason === "no_save") return "HubSave がないため保存していません（格納庫へ の帰還 URL で反映されます）。";
  if (res.reason === "write_refused") return "HubSave に保存できませんでした（新しい版のセーブ）。";
  return "";
}

/** 項目4-1 C8: the captain's 「積載 n/2・速度 N」 in the existing captain HUD line. */
export function leaderLoadHud(world: World): string {
  // 項目4-2 N2: carrying the captain's wreck, the map tap drives that wingman.
  const rescuer = captainRescuer(world);
  if (rescuer) return `${rescuer.name}を操作中（${world.leader.alive ? "隊長機" : "隊長機の残骸"}を積載）・${loadLineJa(world, rescuer)}${shieldHudText(world, rescuer) ? `・${shieldHudText(world, rescuer)}` : ""}`;
  const activity = effectiveActivity(world, world.leader);
  const line = loadLineJa(world, world.leader) + (shieldHudText(world, world.leader) ? `・${shieldHudText(world, world.leader)}` : "") + (activity == null ? "" : `・活動量 ${Number(activity.toFixed(1))}`);
  return inCampAura(world, world.leader) && unitLoad(world, world.leader) <= 0 ? `${line}・軽装キャンプ圏` : line;
}
