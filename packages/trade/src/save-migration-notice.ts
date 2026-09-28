import type { HubSaveLoadResult } from "@estg/shared";

/** Human-readable one-shot notice for save conversion/recovery. */
export function saveMigrationNotice(result: HubSaveLoadResult): string {
  switch (result.status) {
    case "migrated":
      return result.storedVersion != null
        ? `旧セーブ(v${result.storedVersion})を新しい保存形式へ移行しました。`
        : "旧セーブを新しい保存形式へ移行しました。";
    case "corrupt_backed_up":
      return "セーブデータを読み込めなかったため、破損データをバックアップして初期HUBで開始しました。";
    default:
      if (result.droppedCircuits > 0) {
        return `読み込めない回路${result.droppedCircuits}件を除外してセーブを復元しました。`;
      }
      return "";
  }
}
