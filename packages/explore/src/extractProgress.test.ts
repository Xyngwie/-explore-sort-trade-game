import { describe, expect, it } from "vitest";
import { extractionProgressPct } from "./extractProgress";

describe("extractionProgressPct", () => {
  it("starts at zero and reaches 100 at the end", () => {
    expect(extractionProgressPct(10, 5, 5)).toBe(0);
    expect(extractionProgressPct(0, 5, 5)).toBe(100);
  });

  it("clamps invalid countdown values", () => {
    expect(extractionProgressPct(-5, 5, 5)).toBe(100);
    expect(extractionProgressPct(20, 5, 5)).toBe(0);
  });
});
