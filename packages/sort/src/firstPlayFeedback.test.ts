import { describe, expect, it } from "vitest";
import { SORT_FIRST_PLAY_GUIDE } from "./firstPlayFeedback";

describe("SORT_FIRST_PLAY_GUIDE", () => {
  it("covers the basic first-play loop", () => {
    expect(SORT_FIRST_PLAY_GUIDE).toContain("そろえて消去");
    expect(SORT_FIRST_PLAY_GUIDE).toContain("連鎖");
    expect(SORT_FIRST_PLAY_GUIDE).toContain("産出");
  });
});
