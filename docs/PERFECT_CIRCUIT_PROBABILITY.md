# Perfect Circuit probability (random Slitherlink-like boards)

**Status:** analysis note + injection-rate wiring (restore/hangar) · 2026-09-20 (JST)  
**Related:** [`RESTORE_V0.md`](./RESTORE_V0.md), [`RESTORE_CIRCUIT_PARADOX_V0.md`](./RESTORE_CIRCUIT_PARADOX_V0.md)

> Question: if we fill a restore-sized board with **random digit clues**, how often is it a **fully solvable unique Perfect Circuit** (classic Slitherlink: exactly one simple loop satisfying all clues)?

**Headline:** natural random generation does **not** yield usable Perfect rates on 6×6 / 8×8. Use **seeded / guaranteed true-board injection** (and optional uniqueness-preserving clue thinning) to hit design targets such as ~1% or ~0.1%.

---

## 1. Model (matches restore boards)

| Item | Choice |
|---|---|
| Grid | Cell lattice `R×C` (primary: **6×6**, **8×8**; baselines 3×3 / 4×4 / 5×5) |
| Clues | Per cell: digit in `{0,1,2,3}` or blank. Dense = every cell digit. |
| Edges | Horizontal + vertical grid lines (`CircuitBoardState` edge pack in `RESTORE_V0`) |
| Solution | Exactly **one** simple closed loop; each clued cell has that many incident loop edges |
| Perfect Circuit | Board admits **exactly one** such solution (uniquely solvable) |
| Flawed (contrast) | Zero solutions (inconsistent) **or** ≥2 solutions (ambiguous) — both are non-Perfect |

This matches the paradox memo’s “perfect rare / flawed common” intent without requiring the full restore solver product.

### Clue-generation models tested

| ID | Generator |
|---|---|
| **dense_uniform** | Every cell ~ Unif`{0,1,2,3}` independently |
| **sparse_p** | Each cell clued with probability `p`, else blank; digit ~ Unif`{0,1,2,3}` |
| **seeded_keep_q** | Sample a simple loop → fill **all** cell counts from that loop → keep each clue independently with probability `q` (else blank). Always ≥1 solution when loop sampling succeeds. |

`seeded_keep_q` is a **blind** sparsify (no uniqueness filter). Production generators usually remove clues only while uniqueness holds; rates below for `q<1` are therefore a **lower** uniqueness yield than a proper removal loop.

---

## 2. Combinatorial sketch

Dense clue space size:

| Grid | `#boards` = `4^(R·C)` | `#edges` |
|---|---|---|
| 4×4 | `4^16 ≈ 4.3×10^9` | 40 |
| 6×6 | `4^36 ≈ 4.7×10^21` | 84 |
| 8×8 | `4^64 ≈ 3.4×10^38` | 144 |

Each simple loop `L` induces **one** dense signature (the cell-count vector). Let `𝒮` be the set of simple loops on the grid. Then

```text
P_dense(any solution)  ≤  |{signatures of loops}| / 4^(R·C)  ≤  |𝒮| / 4^(R·C).
```

`|𝒮|` grows far slower than `4^(R·C)`. Empirically, dense boards are almost always **locally inconsistent** (propagation fails with ~0 search nodes). Hence random dense fill is an astronomically bad Perfect source — consistent with the literature practice of **starting from a known loop**, then deleting clues (Shirai / Wan / common generators), not sampling digits first.

Sparse random boards trade consistency for ambiguity: lowering `p` raises `P(any)` but the survivors are overwhelmingly **multi-solution**, so `P(unique)` stays near zero on 6×6+.

---

## 3. Monte Carlo method

- Custom propagating Slitherlink counter (edge assignment + cell/vertex forcing; count up to 2 solutions).
- Per-trial node caps (≈2e4–2e5); timeouts counted separately and excluded from rate denominators where noted.
- Dense extra pass: 3k–5k trials/grid for Rule-of-3 upper bounds when zero uniques observed.
- Date: 2026-09-20 (JST). Implementation is analysis-only (not shipped in `packages/restore`).

**Rule of three:** if 0 uniques in `n` i.i.d. trials, a rough 95% upper bound is `3/n`.

---

## 4. Results — headline numbers

### 4.1 Dense uniform (every cell 0–3)

| Grid | Trials | Unique | Any | `P_unique` (point) | ~95% upper (Rule-of-3 if 0) |
|---|---:|---:|---:|---:|---:|
| 3×3 | 5000 | 7 | 7 | **~0.14%** | — |
| 4×4 | 5000 | 0 | 0 | **0** | **< 0.06%** |
| 6×6 | 5000 | 0 | 0 | **0** | **< 0.06%** |
| 8×8 | 3000 | 0 | 0 | **0** | **< 0.10%** |

On restore sizes, dense random is effectively **never** solvable (hence never Perfect). Even the optimistic combinatorial bound is tiny; MC finds **zero** anys in thousands of 6×6/8×8 trials.

### 4.2 Sparse random (independent clue probability `p`)

**6×6** (250 trials / `p`):

| `p` | `P_any` (known) | `P_unique` | Notes |
|---:|---:|---:|---|
| 0.15 | ~0.79 | **0** | many timeouts; all known solvables were multi |
| 0.25 | ~0.58 | **0** | |
| 0.35 | ~0.26 | **0** | |
| 0.50 | ~0.024 | **0** | |
| 0.70 | 0 | 0 | all inconsistent |

**8×8** (125 trials / `p`): same pattern — `P_any` can be tens of percent at low `p`, but **`P_unique = 0` in-sample**; most completions are multi-loop / multi-solution.

**4×4** only: sparse can stumble into uniques at ~**1–2%** (`p≈0.2–0.35`), collapsing toward 0 as `p→1`. Not a path for 6×6/8×8 design rates.

### 4.3 Seeded loop → keep fraction `q` (guaranteed solvable)

| Grid | `q` (keep) | Trials | `P_any` | `P_unique` (approx) |
|---|---:|---:|---:|---:|
| 6×6 | 1.00 | 120 | 1.0 | **100%** |
| 6×6 | 0.55 | 120 | 1.0 | **~50%** |
| 6×6 | 0.35 | 120 | 1.0 | **~19%** |
| 6×6 | 0.25 | 120 | 1.0 | **~4%** (some TO) |
| 6×6 | 0.15 | 120 | 1.0 | **~4%** known (many TO) |
| 8×8 | 1.00 | 80 | 1.0 | **100%** |
| 8×8 | 0.55 | 80 | 1.0 | **~49%** |
| 8×8 | 0.35 | 80 | 1.0 | **~9%** |
| 8×8 | 0.25 | 80 | 1.0 | **~7%** known |

Full signatures from a true loop are Perfect (unique in all seeded-full trials here). Blind thinning without a uniqueness check wastes most boards into ambiguity; a **delete-while-unique** generator recovers sparse *playable* Perfect boards at will.

---

## 5. Conclusion & recommendation

| Approach | Usable for Perfect Circuit drop rates? |
|---|---|
| Dense random digits | **No** — `P_any ≈ 0` on 6×6/8×8 |
| Sparse random digits | **No** for uniqueness — `P_any` can be large, `P_unique ≈ 0` |
| Seeded true loop (+ optional uniqueness-preserving clue removal) | **Yes** — Perfect on demand |
| Mixture: mostly flawed + inject Perfect at target rate | **Yes** — match design rarity (e.g. 1%, 0.1%) |

**Product recommendation (aligns with RESTORE / paradox “perfect rare”):**

1. **Do not** sample digit boards hoping for natural Perfect rates.
2. **Generate Perfect boards** by: sample loop → fill clues → remove clues while a uniqueness oracle still says “exactly one” (standard Slitherlink pipeline).
3. **Control world rarity** by **injection rate**, not by random clue luck:
   - Target **~1%** Perfect among circuit drops → inject 1 guaranteed Perfect per ~100 boards (rest flawed: contradictory clues, broken edges, or intentional multi).
   - Target **~0.1%** → inject 1 per ~1000.
4. Flawed boards remain the daily path (Bypass / partial score); Perfect remains the lockable world item (`RESTORE_V0` §5.4.2).

Natural random generation **cannot** replace seeded injection for restore-sized Perfect Circuit rates.

---

## 6. Assumptions & limits

- Classic single-loop Slitherlink only (no multi-loop “名機” scoring from the paradox memo).
- Digits modeled as `{0,1,2,3}`; seeded fill may emit `4` on a 1-cell loop (rare with our walk sampler).
- Loop sampler is a random self-avoiding close — biased toward shorter cycles; not a uniform measure over `𝒮`. Seeded-full uniqueness still held in-sample.
- Solver is incomplete under node caps: timeouts bias sparse/`q` small estimates; dense results are solid (instant inconsistency).
- Not a balance table; injection rates are design knobs, not measured player economy.

---

## 7. Repro sketch

Propagating edge DFS counting solutions ≤2; dense / sparse / seeded generators as in §1. Re-run locally with a short script under analysis tooling if needed; this note is the contract for design, not a CI gate.


---

## 8. Implemented injection rates (runtime)

Seeded true boards are mixed into restore generation / hangar demo grants via **injection rate**, not natural random digits.

| Constant | Value | When |
|---|---:|---|
| `PERFECT_CIRCUIT_PROD_RATE` | **0.01** (1%) | Production / formal default |
| `PERFECT_CIRCUIT_PROD_RATE_ALT` | **0.001** (0.1%) | Docs alternate — select with env `PERFECT_CIRCUIT_RATE` / `VITE_PERFECT_CIRCUIT_RATE=0.001` |
| `PERFECT_CIRCUIT_DEV_RATE` | **0.33** (33%) | Vite `import.meta.env.DEV`, localhost / 127.0.0.1, or temporary playtest |

**Resolution order** (`resolvePerfectCircuitInjectRate`):

1. Query `?perfectRate=0.33` (wins)
2. Env `PERFECT_CIRCUIT_RATE` / `VITE_PERFECT_CIRCUIT_RATE`
3. DEV / localhost → 33%
4. else → **1%** prod

**API:** `rollPerfectCircuit(rng, { rate })` · `buildInjectedOrFlawedPuzzle` / restore `generatePuzzle(..., { injectRate })` · true path = `buildTruePuzzleFromSolution()` (verify-true 2×2 from known loop). Flawed path keeps random digit fill.

**UI:** restore HUD shows 「真盤気配」 when a true board was injected; hangar seed log/notice notes 真盤注入. Majority of boards remain flawed.

