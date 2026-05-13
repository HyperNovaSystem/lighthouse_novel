# The Lighthouse Correspondence

DOMECS exemplar #3 from `domecs/doc/exemplars.md`: a DOM-first, event-driven visual novel whose narrative state matters more than kinetic simulation.

## Spec slice

This example should demonstrate that DOMECS can express a visual novel without treating every script node as an entity or requiring a continuously-running tick loop.

Acceptance criteria:

- The script is ordinary data with at least 2,000 dialogue nodes; script nodes are **not** DOMECS entities.
- The world starts with roughly VN-scale live entities: 40 character affinity records plus a small set of scene/UI entities.
- Progress is driven by user events (`AdvanceText`, `ChooseOption`, `SaveRequested`, `LoadRequested`) handled by event systems. No tick/fixed simulation systems are required for story progress.
- Choices are condition-gated by narrative state and may mutate character affinity, flags, ending state, gallery unlocks, and transcript backlog.
- Save slots are snapshots with metadata (scene thumbnail, label, tick); loading a slot restores story state and rebuilds transient DOM-view entities.
- DOM rendering uses text-centric views: background, portraits, dialogue box, choices, transcript, gallery, and save slots.
- Transient UI/view components are omitted from snapshots; persistent story state remains serializable JSON.

## Run

```bash
npm install
npm test
npm run dev
```
