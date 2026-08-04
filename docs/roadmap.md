# Roadmap

## Completed Features (Implemented)
- [x] **Rust Core Engine (`usp-core`)**: Cross-platform protocol logic compiling to WASM and Native C-ABI (FFI).
- [x] **Hybrid Logical Clocks (HLC) & CRDTs**: Last-Write-Wins (LWW) state resolution using logical timestamps and tombstones for conflict-free sync.
- [x] **Proxy Interception**: JavaScript proxies that natively intercept mutations and emit zero-payload delta frames.
- [x] **Offline Queuing & Reconnection**: Client-side offline mutation queues that buffer edits and flush upon network reconnection.
- [x] **Time-To-Live (TTL)**: Automatic ephemeral lifecycle management (depending on the Storage Adapter).
- [x] **Permissions & Access Control**: Support for read-only states and `rw` permissions (aligning with `access: global | server | client`).

## Core Features (In Progress / Planned)
- [ ] **Advanced Data Structures**: Support for Queues, Arrays, Hashes, Objects, and zero-payload executable functions/actions.
- [ ] **Lifecycle & Hooks**: Granular lifecycle hooks (e.g., `onUpdate`, `before`, `after`, `destroy`, `dequeue`).
- [ ] **Dynamic Aliasing**: Ability to add, remove, and update aliases/names for state channels dynamically.

## Under Consideration (Exploratory / Maybe)
- [ ] **Remote Sharing**: Shareable state on remote (e.g., for AI integrations or global access).
- [ ] **Relations / Associations**: Lightweight associations between states (avoiding heavy DBMS-like paradigms to empower users with clever tricks).
- [ ] **Expanded Storage Adapters**: Support for any DB (expanding beyond SQLite, Redis, and Memory), potentially including object storage like S3.
