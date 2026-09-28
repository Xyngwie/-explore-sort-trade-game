# Agent declarations

## Stone
- **Agent:** Stone
- **Role:** implementation agent
- **Current objective:** refactor the Sort engine safely toward the canonical four-resource model (`ammo`, `armor`, `power`, `junk`), including splitting the oversized legacy implementation into maintainable modules before completing the internal type migration.
- **Purpose:** preserve the existing Sort rules and interfaces while removing the legacy `food` / `material` / `energy` vocabulary and reducing merge/CI conflicts when multiple coding agents work in parallel.
- **Working rule:** make changes only on the dedicated Stone branch, keep commits narrowly scoped, avoid rewriting unrelated modules, and verify the resulting diff before requesting merge.

Other agents should add their own declaration here rather than editing Stone's section.
