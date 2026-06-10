# Findings — lighthouse_novel

App-level deficiencies and adoption notes for this repo. Engine deficiencies go
to the root ledger in `../domecs/FINDINGS.md`.

- 2026-06-10 — Deviation from Reqall #2681's literal wording ("hand-rolled
  snapshot history -> createSnapshotHistory"): this app's save mechanism is
  NAMED SLOTS, not linear history, so the shape-faithful engine adoption is
  `@domecs/persist` `save()`/`load()` over a `Storage` adapter with per-slot
  `meta` ({label, thumbnail, tick, nodeId}) — not `createSnapshotHistory`
  (linear ring, no named slots, no per-slot metadata).
