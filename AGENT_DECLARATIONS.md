# Agent declarations

## Stone
- **Agent:** Codex (ChatGPT) / Stone
- **Role:** HUB implementation agent
- **Current objective:** Implement and maintain HUB circuit functions, including circuit equip/unequip, purchase and related HUB-side circuit management.
- **Purpose:** Provide the HUB-side implementation while keeping the Sort engine and shared data-contract work isolated from this agent.
- **Owns:** HUB implementation (`packages/hub/**` or the repository's equivalent HUB module).
- **Does not own:** `packages/sort/**`; shared circuit/data contracts under `packages/shared/**`.
- **Boundary rule:** If a new shared contract is required, request it from Spear rather than changing shared contracts independently.

## Parallel-agent boundary
- Execution Captain owns `packages/sort/**`, especially `refine-legacy` splitting, selftest fixes, and Sort build recovery.
- Spear owns `packages/shared/**` and the circuit/data contracts between modules.
- Other agents should add their own declaration here rather than editing another agent's section.
