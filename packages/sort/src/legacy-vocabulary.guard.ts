import { readdirSync, readFileSync } from "node:fs";
const srcDir = new URL(".", import.meta.url);
const files = readdirSync(srcDir).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".selftest.ts") && name !== "refine-legacy.ts" && name !== "resource-model.ts" && name !== "legacy-vocabulary.guard.ts",
);

// Keep the legacy vocabulary confined to the explicit migration boundary until
// refine-legacy.ts is fully replaced by the canonical engine.
const forbidden = ["food", "material", "energy"];
const offenders: string[] = [];

for (const file of files) {
  const text = readFileSync(new URL(file, srcDir), "utf8");
  for (const word of forbidden) {
    if (text.includes(word)) offenders.push(`${file}: ${word}`);
  }
}

if (offenders.length > 0) {
  throw new Error(`legacy Sort vocabulary escaped its migration boundary:\n${offenders.join("\n")}`);
}
