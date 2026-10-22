import { alphaLabEvidence, changeLabCircuit, commitLabEdit, copyNormalSaveToLab, createLabCircuit, editLabCredits, labHub, labNumber, labOwnerLabel, type AlphaLabHost, type LabAction } from "./alpha-lab";
import { CIRCUIT_EFFECT_LABEL_JA, FALSE_BOARD_EFFECT_KEYS, TRUE_BOARD_EFFECT_KEYS, classifyCircuit, type CircuitEffectKey } from "./circuit-actions";
import { resolveModuleBaseUrl } from "./constants";
import { DEBUG_META_KEY } from "./debug-storage";
import type { HubSnapshot } from "./hub-save";

/** UI-only form plumbing. All validation is repeated by the transition layer. */
export function mountAlphaLabEditors(box:HTMLElement,host?:AlphaLabHost):void {
  if(!localStorage.getItem(DEBUG_META_KEY))localStorage.setItem(DEBUG_META_KEY,JSON.stringify({type:"ALPHA_LAB",preset:"CUSTOM",run:crypto.randomUUID(),DEBUG_FIXTURE:true,createdAt:new Date().toISOString()}));
  const badge=document.createElement("div");badge.id="alpha-lab-badge";badge.textContent="ALPHA_LAB · DEBUG_FIXTURE";badge.style.cssText="position:fixed;right:4px;bottom:4px;z-index:10000;padding:4px;background:#171b20;color:#ffd66b;font-size:11px;pointer-events:none;border:1px solid #d5a948;border-radius:4px";document.body.append(badge);
  const top=document.createElement("section");top.id="alpha-lab";
  const title=document.createElement("h2");title.textContent="アルファ実験室";top.append(title);
  const notice=document.createElement("p");notice.textContent="実験用の機能です。予期しない挙動が発生する場合があります。通常セーブとは隔離されています。";top.append(notice);
  const limits=document.createElement("p");limits.textContent="装備枠・カテゴリ・積載枠・機体ごとの上限は通常ルールを使用します。生成する回路は検証済みの2×2です。";top.append(limits);
  const status=document.createElement("p");status.id="lab-status";status.setAttribute("role","status");status.style.whiteSpace="pre-wrap";top.append(status);
  const meta=JSON.parse(localStorage.getItem(DEBUG_META_KEY)!);
  const active=document.createElement("p");active.textContent=`現在の実験：${meta.preset??"CUSTOM"}`;top.append(active);
  if(meta.preset==="NORMAL_SAVE_COPY")status.textContent="通常セーブを実験領域へコピーしました。以後の編集は実験用セーブだけに適用されます。";
  const section=(name:string)=>{const d=document.createElement("details"),s=document.createElement("summary");s.textContent=name;d.append(s);d.style.cssText="padding:8px 0;border-top:1px solid #667";top.append(d);return d;};
  const credits=section("資金"),circuits=section("回路"),shields=section("盾"),units=section("機体"),evidence=section("証拠JSON・通常セーブのコピー");
  const field=(parent:HTMLElement,id:string,label:string,kind:"input"|"select"="input")=>{
    const wrap=document.createElement("label");wrap.textContent=label;wrap.style.cssText="display:block;margin:8px 0";
    const el=document.createElement(kind);el.id=id;el.style.cssText="display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:44px";
    if(el instanceof HTMLInputElement){el.type="number";el.min="0";el.step="any";el.inputMode="decimal";}
    wrap.append(el);parent.append(wrap);return el;
  };
  const input=(p:HTMLElement,id:string,label:string)=>field(p,id,label) as HTMLInputElement;
  const select=(p:HTMLElement,id:string,label:string)=>field(p,id,label,"select") as HTMLSelectElement;
  const options=(el:HTMLSelectElement,rows:{value:string;label:string}[])=>{const old=el.value;el.replaceChildren();for(const r of rows){const o=document.createElement("option");o.value=r.value;o.textContent=r.label;el.append(o);}if(rows.some(r=>r.value===old))el.value=old;};
  const show=(before:unknown,after:unknown)=>{status.textContent=`成功\n変更前：${JSON.stringify(before)}\n変更後：${JSON.stringify(after)}`;};
  const button=(parent:HTMLElement,id:string,label:string,fn:()=>void)=>{const b=document.createElement("button");b.type="button";b.id=id;b.textContent=label;b.style.cssText="min-height:44px;max-width:100%;margin:4px";b.onclick=()=>{try{fn();}catch(e){status.textContent=`失敗：${e instanceof Error?e.message:String(e)}`;}};parent.append(b);};
  const persist=(hub:HubSnapshot,action?:LabAction)=>{commitLabEdit(hub,host,action);window.dispatchEvent(new Event("alpha-lab-change"));refresh();};
  const current=document.createElement("p");current.id="lab-current-credits";credits.append(current);
  const amount=input(credits,"lab-credits","指定額（非負整数）");amount.step="1";amount.inputMode="numeric";
  for(const [op,label] of [["set","指定額へ設定"],["add","指定額を加算"],["zero","0へ設定"],["initial","初期状態へ戻す"]] as const)button(credits,`lab-credits-${op}`,label,()=>{const h=labHub(),next=editLabCredits(h,amount.value,op);if((op==="zero"||op==="initial")&&!confirm(`所持金 ${h.credits}c → ${next.credits}c に変更しますか？`))return;persist(next);show(h.credits,next.credits);});
  const kind=select(circuits,"lab-circuit-kind","回路の種類");options(kind,[{value:"false",label:"偽盤"},{value:"true",label:"真盤"}]);
  const effect=select(circuits,"lab-circuit-effect","効果"),online=select(circuits,"lab-circuit-online","配線状態");options(online,[{value:"online",label:"Online（配線済み・有効）"},{value:"offline",label:"Offline（未配線・効果0）"}]);
  const fillEffects=()=>options(effect,(kind.value==="true"?TRUE_BOARD_EFFECT_KEYS:FALSE_BOARD_EFFECT_KEYS).map(value=>({value,label:CIRCUIT_EFFECT_LABEL_JA[value]??value})));kind.onchange=fillEffects;fillEffects();
  const circuitOwner=select(circuits,"lab-circuit-owner","装備先（機体を選択）"),existing=select(circuits,"lab-circuit-existing","既存の回路");
  const circuitList=document.createElement("pre");circuitList.id="lab-circuit-list";circuitList.style.cssText="white-space:pre-wrap;max-height:300px;overflow:auto";circuits.append(circuitList);
  button(circuits,"lab-circuit-create","回路を生成",()=>{const h=labHub(),next=createLabCircuit(h,effect.value as CircuitEffectKey,kind.value==="true",online.value==="online",circuitOwner.value||null);persist(next);show({circuits:h.circuits.length},{circuits:next.circuits.length,generated:next.circuits.at(-1)?.effectKey});});
  for(const [op,label]of[["equip","選択回路を装備"],["unequip","選択回路の装備を解除"],["delete","選択した検証用回路を削除"]]as const)button(circuits,`lab-circuit-${op}`,label,()=>{if(op==="delete"&&!confirm("選択した検証用回路を削除しますか？"))return;const h=labHub(),before=h.circuits.find(c=>c.circuitId===existing.value),next=changeLabCircuit(h,existing.value,op,circuitOwner.value||null);persist(next);show({id:before?.circuitId,owner:before?.equippedTo},{operation:label,owner:next.circuits.find(c=>c.circuitId===before?.circuitId)?.equippedTo??null});});
  const liveHelp=document.createElement("p");liveHelp.textContent="盾・機体の直接編集はExploreで行います。基礎バッテリー値を編集し、回路による活動量倍率は通常どおり適用されます。設置盾の移動は既存の撤去を使ってください。";top.append(liveHelp);
  const continueLink=document.createElement("a");continueLink.id="lab-continue";continueLink.href=resolveModuleBaseUrl("explore");continueLink.textContent="現在の実験状態でExploreへ";top.append(continueLink);
  const home=document.createElement("a");home.id="lab-home";home.href=resolveModuleBaseUrl("trade");home.textContent="実験用HUBへ";home.style.display="block";top.append(home);
  const unitTarget=select(units,"lab-unit","対象機体"),hp=input(units,"lab-unit-hp","機体HP"),ammo=input(units,"lab-unit-ammo","弾薬（整数）"),battery=input(units,"lab-unit-battery","バッテリー（基礎活動量）");ammo.step="1";ammo.inputMode="numeric";
  const unitInfo=document.createElement("pre");unitInfo.id="lab-unit-info";unitInfo.style.whiteSpace="pre-wrap";units.append(unitInfo);
  const fillUnit=()=>{const view=host?.view(),u=view?.units.find(u=>u.id===unitTarget.value);if(!u)return;hp.value=String(u.hp);hp.max=String(u.maxHp);ammo.value=String(u.ammo);ammo.max=String(u.ammoMax);battery.value=String(u.battery);battery.max=String(u.batteryMax);unitInfo.textContent=JSON.stringify({...u,circuits:labHub().circuits.filter(c=>c.equippedTo===u.instanceId).map(c=>({effect:CIRCUIT_EFFECT_LABEL_JA[c.effectKey??""]??"回路",state:c.restoreState})),shields:view!.shields.filter(s=>s.where.startsWith(u.id+" "))},null,2);};unitTarget.onchange=fillUnit;
  button(units,"lab-unit-apply","選択機体へ適用",()=>{if(!host)throw new Error("Exploreで機体を選択してください");const before=host.view().units.find(u=>u.id===unitTarget.value);if(!before)throw new Error("対象機体がありません");const action:LabAction={kind:"unit",unitId:unitTarget.value,hp:labNumber(hp.value,false,before.maxHp),ammo:labNumber(ammo.value,true,before.ammoMax),battery:labNumber(battery.value,false,before.batteryMax)};if((action.hp===0||action.battery===0)&&!confirm("HPまたは活動量0で機体が残骸になります。適用しますか？"))return;persist(labHub(),action);show(before,host.view().units.find(u=>u.id===action.unitId));});
  const shieldTarget=select(shields,"lab-shield-unit","生成先の機体"),where=select(shields,"lab-shield-where","生成先の所在");options(where,[{value:"equipped",label:"選択機体に装備"},{value:"reserve",label:"選択機体の予備盾"},{value:"ground",label:"選択機体の位置の地面"}]);
  const shieldHP=input(shields,"lab-shield-hp","現在HP（0は破壊）"),shieldMax=input(shields,"lab-shield-max","最大HP");shieldHP.value="50";shieldMax.value="50";
  const shieldSelect=select(shields,"lab-shield-existing","既存の盾"),shieldList=document.createElement("pre");shieldList.id="lab-shield-list";shieldList.style.cssText="white-space:pre-wrap;max-height:300px;overflow:auto";shields.append(shieldList);
  shieldSelect.onchange=()=>{const s=host?.view().shields.find(s=>s.key===shieldSelect.value);if(s){shieldHP.value=String(s.hp);shieldMax.value=String(s.maxHp);}};
  const shieldEdit=(kind:"shield-create"|"shield-hp"|"shield-delete")=>{if(!host)throw new Error("Exploreで盾を編集してください");const before=host.view().shields;const values=kind==="shield-delete"?{hp:0,maxHp:1}:{hp:labNumber(shieldHP.value),maxHp:labNumber(shieldMax.value)};if(kind!=="shield-delete"&&(values.maxHp<=0||values.hp>values.maxHp))throw new Error("現在HPは0〜最大HP、最大HPは正数にしてください");if((kind==="shield-delete"||values.hp===0)&&!confirm("選択した盾を破壊・削除しますか？"))return;
    const action:LabAction=kind==="shield-create"?{kind,unitId:shieldTarget.value,where:where.value as "equipped"|"reserve"|"ground",...values}:kind==="shield-hp"?{kind,key:shieldSelect.value,...values}:{kind,key:shieldSelect.value};persist(labHub(),action);show(before,host.view().shields);};
  button(shields,"lab-shield-create","通常盾を生成・配置",()=>shieldEdit("shield-create"));button(shields,"lab-shield-apply","選択盾のHPを変更",()=>shieldEdit("shield-hp"));button(shields,"lab-shield-delete","選択盾を削除",()=>shieldEdit("shield-delete"));
  button(shields,"lab-shield-move","選択盾の装備先・所在を変更",()=>{if(!host)throw new Error("Exploreで盾を編集してください");if(!confirm("選択した盾の装備先・所在を変更しますか？"))return;const before=host.view().shields;persist(labHub(),{kind:"shield-move",key:shieldSelect.value,unitId:shieldTarget.value,where:where.value as "equipped"|"reserve"|"ground"});show(before,host.view().shields);});
  if(host?.pause)button(top,"lab-pause","実験を一時停止／再開",()=>{status.textContent=host.pause!()?"一時停止しました。入力欄でのキー操作は機体操作に使いません。":"実験を再開しました。";});
  button(evidence,"lab-export","ALPHA_LAB証拠JSONを出力",()=>{const data=alphaLabEvidence(host),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="ALPHA_LAB-evidence.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent="ALPHA_LAB / DEBUG_FIXTUREの証拠JSONを出力しました。";});
  button(evidence,"lab-copy-normal","通常セーブを実験領域へコピー",()=>{if(!confirm("現在の実験状態を置き換え、通常セーブを実験領域へコピーします。元の通常セーブは変更しません。続けますか？"))return;copyNormalSaveToLab();location.assign(resolveModuleBaseUrl("trade"));});
  function refresh(){const h=labHub();current.textContent=`現在の所持金：${h.credits}c`;options(circuitOwner,[{value:"",label:"倉庫（装備しない）"},...h.fleet.map((m,i)=>({value:m.instanceId,label:`${labOwnerLabel(h,m.instanceId,host?.view().units)} · ${m.catalogId}`}))]);options(existing,h.circuits.map(c=>({value:c.circuitId,label:`${CIRCUIT_EFFECT_LABEL_JA[c.effectKey??""]??"回路"} · ${c.restoreState} · ${c.equippedTo?labOwnerLabel(h,c.equippedTo,host?.view().units):"倉庫"}`})));circuitList.textContent=h.circuits.map(c=>`${CIRCUIT_EFFECT_LABEL_JA[c.effectKey??""]??"回路"} / ${c.restoreState} / 効果 ${classifyCircuit(c).effect} / ${c.equippedTo?"装備中":"倉庫"}`).join("\n");
    const view=host?.view();const targets=view?.units.map(u=>({value:u.id,label:u.name}))??[];options(unitTarget,targets);options(shieldTarget,targets);fillUnit();options(shieldSelect,view?.shields.map(s=>({value:s.key,label:`盾${s.shieldId} · ${s.hp}/${s.maxHp} · ${s.where}`}))??[]);shieldList.textContent=JSON.stringify(view?.shields??[],null,2);
  }
  button(top,"lab-refresh","現在値を再表示",refresh);box.append(top);refresh();
  button(top,"lab-reload","現在の実験状態を保存して再読込",()=>{if(!confirm("現在の実験状態を保存して再読込しますか？"))return;commitLabEdit(labHub(),host);location.reload();});
}
