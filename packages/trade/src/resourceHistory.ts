/**
 * Visualize recent expedition / refine loot & hub resource changes.
 * Derives from Hangar log lines — no price / economy mutations.
 */

export type ResourceHistorySource =
  | "explore"
  | "sort"
  | "invade"
  | "restore"
  | "hub"
  | "other";

export type ResourceHistoryPolarity = "gain" | "spend" | "neutral";

export type ResourceDeltaChip = {
  label: string;
  /** Signed amount when numeric; null for qualitative chips. */
  amount: number | null;
  unit?: string;
};

export type ResourceHistoryEntry = {
  polarity: ResourceHistoryPolarity;
  source: ResourceHistorySource;
  title: string;
  chips: ResourceDeltaChip[];
  raw: string;
};

const MAX_VIZ = 10;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Parse a single hangar log line into a resource-history entry when possible. */
export function parseResourceHistoryLine(line: string): ResourceHistoryEntry | null {
  const raw = line.trim();
  if (!raw) return null;

  let m = raw.match(/^搬入 materials \+(\d+)/);
  if (m) {
    return {
      polarity: "gain",
      source: "sort",
      title: "精製 → 資材搬入",
      chips: [{ label: "materials", amount: Number(m[1]), unit: "m" }],
      raw,
    };
  }

  m = raw.match(/^搬入 yieldBag (.+)$/);
  if (m) {
    const chips: ResourceDeltaChip[] = m[1]!
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [k, v] = part.split(":");
        const n = Number(v);
        return {
          label: (k ?? part).trim(),
          amount: Number.isFinite(n) ? n : null,
        };
      });
    return {
      polarity: "gain",
      source: "sort",
      title: "精製 → YieldBag",
      chips,
      raw,
    };
  }

  m = raw.match(/^未開封コンテナ預け \+(\d+)/);
  if (m) {
    return {
      polarity: "gain",
      source: "sort",
      title: "未開封コンテナ預け",
      chips: [{ label: "未開封", amount: Number(m[1]) }],
      raw,
    };
  }

  m = raw.match(/^帰還ウェア/);
  if (m) {
    return {
      polarity: "neutral",
      source: "explore",
      title: "探索帰還（摩耗）",
      chips: [{ label: "wear", amount: null }],
      raw,
    };
  }

  m = raw.match(/^invade セクター/);
  if (m) {
    return {
      polarity: "neutral",
      source: "invade",
      title: "戦線セクター",
      chips: [{ label: "intel", amount: null }],
      raw,
    };
  }

  m = raw.match(/^restore 回路/);
  if (m) {
    return {
      polarity: "gain",
      source: "restore",
      title: "回路修復受領",
      chips: [{ label: "circuit", amount: null }],
      raw,
    };
  }

  m = raw.match(/レア売却 .+→ \+(\d+)c/);
  if (m) {
    return {
      polarity: "gain",
      source: "hub",
      title: "レア売却",
      chips: [{ label: "credits", amount: Number(m[1]), unit: "c" }],
      raw,
    };
  }

  m = raw.match(/未開封購入 .+→ −(\d+)c/);
  if (m) {
    return {
      polarity: "spend",
      source: "hub",
      title: "未開封購入",
      chips: [{ label: "credits", amount: -Number(m[1]), unit: "c" }],
      raw,
    };
  }

  m = raw.match(/回路売却 .+→ \+(\d+)c/);
  if (m) {
    return {
      polarity: "gain",
      source: "hub",
      title: "回路売却",
      chips: [{ label: "credits", amount: Number(m[1]), unit: "c" }],
      raw,
    };
  }

  m = raw.match(/修理\(型付き\).+?(−\d+c)/);
  if (m) {
    const credits = Number(m[1]!.replace(/[−\-c]/g, ""));
    const chips: ResourceDeltaChip[] = [
      { label: "credits", amount: -credits, unit: "c" },
    ];
    const bag = raw.match(/−\[([^\]]+)\]/);
    if (bag) {
      for (const part of bag[1]!.split(",")) {
        const bit = part.trim();
        if (!bit) continue;
        const mm = bit.match(/^(.+?):(\d+)$/);
        if (mm) {
          chips.push({ label: mm[1]!.trim(), amount: -Number(mm[2]) });
        }
      }
    }
    return {
      polarity: "spend",
      source: "hub",
      title: "型付き修理",
      chips,
      raw,
    };
  }

  m = raw.match(/修理\(集計\)/);
  if (m) {
    return {
      polarity: "spend",
      source: "hub",
      title: "修理（集計）",
      chips: [{ label: "repair", amount: null }],
      raw,
    };
  }

  m = raw.match(/解体 .+→ \+(\d+)c \/ \+(\d+)m/);
  if (m) {
    return {
      polarity: "gain",
      source: "hub",
      title: "解体回収",
      chips: [
        { label: "credits", amount: Number(m[1]), unit: "c" },
        { label: "materials", amount: Number(m[2]), unit: "m" },
      ],
      raw,
    };
  }

  m = raw.match(/未開封→仕分 出庫 ×(\d+)/);
  if (m) {
    return {
      polarity: "spend",
      source: "sort",
      title: "未開封→仕分出庫",
      chips: [{ label: "未開封", amount: -Number(m[1]) }],
      raw,
    };
  }

  return null;
}

export function resourceHistoryFromLog(
  log: readonly string[],
  limit = MAX_VIZ,
): ResourceHistoryEntry[] {
  const out: ResourceHistoryEntry[] = [];
  for (const line of log) {
    const entry = parseResourceHistoryLine(line);
    if (entry) out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

const SOURCE_LABEL_JA: Record<ResourceHistorySource, string> = {
  explore: "探索",
  sort: "精製",
  invade: "戦線",
  restore: "修復",
  hub: "拠点",
  other: "他",
};

function formatChip(chip: ResourceDeltaChip): string {
  if (chip.amount == null) {
    return escapeHtml(chip.label);
  }
  const sign = chip.amount > 0 ? "+" : "";
  const unit = chip.unit ?? "";
  return `${escapeHtml(chip.label)} ${sign}${chip.amount}${escapeHtml(unit)}`;
}

/** Compact visual history of resource gain/spend (JA). */
export function buildResourceHistoryHtml(log: readonly string[]): string {
  const entries = resourceHistoryFromLog(log);
  if (entries.length === 0) {
    return `<div class="res-history empty" role="region" aria-label="資源履歴">
      <p class="muted res-history-empty">資源の増減ログはまだありません。探索帰還・精製搬入・売買がここに可視化されます。</p>
    </div>`;
  }
  const rows = entries
    .map((e) => {
      const chips = e.chips
        .map(
          (c) =>
            `<span class="res-chip ${e.polarity}">${formatChip(c)}</span>`,
        )
        .join("");
      return `<li class="res-row polarity-${e.polarity}" data-source="${e.source}">
        <span class="res-src">${SOURCE_LABEL_JA[e.source]}</span>
        <div class="res-body">
          <span class="res-title">${escapeHtml(e.title)}</span>
          <span class="res-chips">${chips}</span>
        </div>
      </li>`;
    })
    .join("");
  return `<div class="res-history" role="region" aria-label="資源履歴">
    <p class="muted res-history-lead">モジュール横断の直近の増減（価格バランス変更なし・ログ由来）</p>
    <ul class="res-list">${rows}</ul>
  </div>`;
}
