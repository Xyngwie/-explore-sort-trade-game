import { describe, expect, it } from "vitest";
import { RESTORE_RULE_GUIDE } from "./rulesGuide";

describe("RESTORE_RULE_GUIDE", () => {
  it("explains the digit rule and loop goal in one line", () => {
    expect(RESTORE_RULE_GUIDE).toContain("数字");
    expect(RESTORE_RULE_GUIDE).toContain("上下左右");
    expect(RESTORE_RULE_GUIDE).toContain("閉ループ");
  });
});
