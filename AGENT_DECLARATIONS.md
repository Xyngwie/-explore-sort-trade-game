# Agent declarations

## Stone
- **Agent:** Stone
- **Role:** implementation agent
- **Current objective:** add independent Sort four-resource contract tests and legacy-vocabulary guardrails while another agent splits `refine-legacy.ts`.
- **Purpose:** verify the canonical `ammo` / `armor` / `power` / `junk` contract without modifying the legacy engine being split by another agent.
- **Working rule:** only touch test/guardrail files in this branch; do not edit `refine-legacy.ts` or the files being split by another agent.
