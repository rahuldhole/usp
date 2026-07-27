# USP CRDT Integration Roadmap

This document outlines the roadmap for migrating the Universal State Protocol (USP) from its current naive "Last-Write-Wins" (LWW) resolution strategy to a robust Conflict-free Replicated Data Type (CRDT) architecture.

## Current State & Limitations
Currently, USP relies on simple HTTP POST mutations and server-sent broadcasts. State synchronization is purely LWW based on message arrival time at the server. This leads to:
* **Race Conditions:** Concurrent mutations to the same key result in arbitrary overrides.
* **No Offline Support:** Offline changes will overwrite newer remote changes upon reconnection.
* **Lack of Granular Merging:** Deeply nested object edits can unintentionally wipe out sibling properties if not managed carefully.

## Phase 1: Research and Architecture
- [ ] **Evaluate CRDT Approaches:** Decide between a lightweight custom JSON CRDT implementation (e.g., LWW-Element-Set, Vector Clocks) versus integrating an established engine like [Yjs](https://yjs.dev/) or [Automerge](https://automerge.org/).
- [ ] **Data Model Overhaul:** Design the storage schema for adapters (Memory, SQLite, Redis) to support historical operations, tombstones, and logical timestamps (e.g., Hybrid Logical Clocks), rather than just flat key-value pairs.

## Phase 2: Core Protocol & Payload Updates
- [ ] **Payload Structure:** Update the HTTP POST and SSE sync payloads to include logical timestamps or vector clocks.
  - *Example:* `{ op: 'SET', key: 'x', val: 1, clock: { clientA: 1, clientB: 4 } }`
- [ ] **Operation Types:** Expand beyond simple `SET` and `EXEC` to include array insertions, deletions, and granular object merges.

## Phase 3: Storage Adapter Upgrades
- [ ] **Adapter Interfaces:** Modify the adapter interface to process and store operations rather than just state snapshots.
- [ ] **Merge Logic:** Implement server-side merge resolution. When the server receives an operation, it must merge it with the existing CRDT state and broadcast the delta or the resulting state.

## Phase 4: Client-Side Proxy Enhancements
- [ ] **Proxy Interception:** Update `core.js` and `proxy.js` to translate local JavaScript mutations (e.g., `state.list.push(item)`) into localized CRDT operations.
- [ ] **Remote Operation Ingestion:** When the client receives a remote SSE broadcast, intelligently apply the CRDT delta to the local proxy object without triggering local mutation events.
- [ ] **Offline Queuing:** Implement a local operation queue to store edits while disconnected, ensuring they are sent with correct causal context upon reconnection.

## Phase 5: Testing & Validation
- [ ] **Simulation Framework:** Build a test harness to simulate network latency, concurrent edits, and partitioned networks.
- [ ] **Chaos Testing:** Ensure that all clients converge to the exact same state regardless of the order in which messages are delivered.
