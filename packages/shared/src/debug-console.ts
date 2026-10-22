import { DEBUG_FIXTURE_ACTIVE, DEBUG_META_KEY, DEBUG_PREFIX, DEBUG_QUERY, DEBUG_VALUE } from "./debug-storage";
import { HUB_SAVE_STORAGE_KEY, resolveModuleBaseUrl } from "./constants";
import { mountAlphaLabEditors } from "./alpha-lab-ui";
import type { AlphaLabHost } from "./alpha-lab";

export const SHIELD_PRESETS = ["NO_SHIELD_NO_CIRCUIT", "NORMAL_SHIELD_AND_RESERVE", "STRIPPING_READY", "P_SHIELD_LEADER_READY", "P_SHIELD_WINGMAN_READY", "BARRICADE_PERSISTENCE_READY"] as const;
export type ShieldPreset = typeof SHIELD_PRESETS[number];
export function isShieldPreset(s: string | null): s is ShieldPreset { return SHIELD_PRESETS.some(p => p === s); }
export const PRESET_STEPS: Record<ShieldPreset, string> = {
  NO_SHIELD_NO_CIRCUIT: "回路・所持盾なし。地面盾をタップ→一覧→2秒拾得。回路なしでも防御でき、残骸盾・屹立は使えないことを確認。",
  NORMAL_SHIELD_AND_RESERVE: "装備盾と予備盾あり。前方の敵が射撃するので、静止して防御・盾破壊後の2秒交換を確認。背面からの弾は防げない。",
  STRIPPING_READY: "通常盾回路あり。『残骸盾』→近くの残骸をタップ→8秒剥離。途中再読込→再開、盾生成、別2秒の拾得を確認。",
  P_SHIELD_LEADER_READY: "隊長に配線済みP盾回路と装備盾。『屹立』→2秒で設置→弾/移動の遮断→設置盾タップ『撤去』→別2秒で拾得。",
  P_SHIELD_WINGMAN_READY: "僚機だけに配線済みP盾回路と装備盾。僚機を選び『屹立』。隊長には屹立が使えず、僚機自身の位置・向きで設置することを確認。",
  BARRICADE_PERSISTENCE_READY: "設置盾と途中作業あり。一時停止を解除して完了→再読込。帰還要請→搭乗→格納庫→再出撃で現地の盾ID・HPを比較。再生成は検証セーブを初期状態へ戻す。",
};
export function fixtureStartUrl(preset: ShieldPreset): string {
  const u = typeof location!=="undefined"&&location.pathname.startsWith("/-explore-sort-trade-game/")
    ? new URL("/-explore-sort-trade-game/explore/",location.origin)
    : new URL(resolveModuleBaseUrl("explore"));
  u.searchParams.set(DEBUG_QUERY, DEBUG_VALUE);
  u.searchParams.set("debug_preset", preset);
  u.searchParams.set("debug_run", crypto.randomUUID());
  return u.toString();
}

function storageSnapshot(store: Storage): Record<string, string | null> {
  return Object.fromEntries([HUB_SAVE_STORAGE_KEY,"estg.sortieCheckpoint"].filter(k=>store.getItem(k)!==null).map(k=>[k,JSON.stringify(JSON.parse(store.getItem(k)!), (key,value)=>["lastEditorName","editorName","latitude","longitude","signature"].includes(key)?undefined:value)]));
}

/** Mounted outside the app root: rerenders cannot remove debug controls. */
export function mountShieldDebugConsole(inspect?: () => unknown, host?: AlphaLabHost): void {
  if (typeof document === "undefined" || document.getElementById("shield-debug-console")) return;
  const box = document.createElement("details"); box.id = "shield-debug-console";
  box.style.cssText = "margin:8px;padding:12px;border:2px solid #d5a948;border-radius:8px;color:inherit;overflow-wrap:anywhere;max-width:100%;box-sizing:border-box";
  const summary = document.createElement("summary"); summary.textContent = DEBUG_FIXTURE_ACTIVE ? "アルファ実験室 · DEBUG_FIXTURE（通常セーブとは別）" : "アルファ実験室 · 開発・検証用：盾システム";box.append(summary);
  if (!DEBUG_FIXTURE_ACTIVE) {
    const a = document.createElement("a"), u = new URL(location.href);u.search = "";u.hash = "";u.searchParams.set(DEBUG_QUERY, DEBUG_VALUE);
    a.href = u.toString();a.textContent = "盾検証モードへ入る（専用セーブ）"; box.append(a);
    const entry=document.createElement("a"),resume=new URL(fixtureStartUrl("NO_SHIELD_NO_CIRCUIT"));resume.searchParams.delete("debug_preset");resume.searchParams.delete("debug_run");entry.href=localStorage.getItem(DEBUG_PREFIX+HUB_SAVE_STORAGE_KEY)?resume.toString():fixtureStartUrl("NO_SHIELD_NO_CIRCUIT");entry.id="alpha-lab-enter";entry.textContent="アルファ実験室へ入る";entry.style.display="block";box.append(entry);
    const notice=document.createElement("p");notice.textContent="資金・回路・盾・機体の状態を自由に変更して遊べるアルファ版の実験機能。実験用の機能です。予期しない挙動が発生する場合があります。";box.append(notice);
  } else {
    const note=document.createElement("p");note.textContent="DEBUG_FIXTURE：変更は検証用セーブのみ。プリセット開始・初期化は現在の検証状態を置き換えます。";box.append(note);
    const select=document.createElement("select");select.id="debug-preset";select.setAttribute("aria-label","検証プリセット");select.style.maxWidth="100%";
    let meta: {preset?: string} = {};try{meta=JSON.parse(localStorage.getItem(DEBUG_META_KEY)??"{}");}catch{/* empty */}
    for(const p of SHIELD_PRESETS){const o=document.createElement("option");o.value=p;o.textContent=p;select.append(o);}if(isShieldPreset(meta.preset??null))select.value=meta.preset!;box.append(select);
    const steps=document.createElement("p");steps.id="debug-steps";const updateSteps=()=>{steps.textContent=PRESET_STEPS[select.value as ShieldPreset];};select.addEventListener("change",updateSteps);updateSteps();box.append(steps);
    const button=(id:string,text:string,fn:()=>void)=>{const b=document.createElement("button");b.type="button";b.id=id;b.textContent=text;b.style.cssText="margin:4px;min-height:44px;max-width:100%";b.onclick=()=>{try{fn();}catch(e){output.textContent=`検証操作に失敗：${String(e)}`;}};box.append(b);};
    const output=document.createElement("pre");output.id="debug-inspection";output.style.cssText="white-space:pre-wrap;max-height:420px;overflow:auto;font-size:12px";
    const evidence=()=>({type:"DEBUG_FIXTURE",at:new Date().toISOString(),url:location.origin+location.pathname,metadata:JSON.parse(localStorage.getItem(DEBUG_META_KEY)??"null"),local:storageSnapshot(localStorage),session:storageSnapshot(sessionStorage),state:inspect?.()??null});
    button("debug-start","テスト開始",()=>{if(!localStorage.getItem(DEBUG_META_KEY)||confirm("現在の実験状態を選択プリセットで置き換えますか？ 通常セーブは変更しません。"))location.assign(fixtureStartUrl(select.value as ShieldPreset));});
    button("debug-reset","検証セーブを初期化・再生成",()=>{if(window.confirm("検証セーブを初期化して選択プリセットを再生成しますか？ 通常セーブは変更しません。"))location.assign(fixtureStartUrl(select.value as ShieldPreset));});
    button("debug-inspect","盾ID・HP・所有状態を確認",()=>{output.textContent=JSON.stringify(evidence().state??evidence(),null,2);});
    button("debug-export","検証証拠をJSON出力",()=>{const blob=new Blob([JSON.stringify(evidence(),null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="DEBUG_FIXTURE-shield-evidence.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    box.append(output);
    mountAlphaLabEditors(box, host);
    const a=document.createElement("a"),u=new URL(resolveModuleBaseUrl("trade"));u.search="";a.href=u.toString();a.id="debug-exit";a.textContent="検証モードを終了して通常HUBへ";box.append(a);
  }
  document.body.prepend(box);
}
