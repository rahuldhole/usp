import { USPServer, MemoryAdapter } from '@rahuldhole/usp/server';

// 1. Create server (WASM is auto-initialized by the server module)
const adapter = new MemoryAdapter();
export const usp = new USPServer(adapter);

// 2. Register server action
usp.registerAction('clearCompleted', async (session, db, mutation) => {
  const state = await db.getState(session);
  for (const [key, val] of Object.entries<any>(state)) {
    if (val && typeof val === 'object' && val.completed) {
      await db.delete(session, key, mutation.hlc);
      usp.broadcast({
        op: 'DELETE', session, key,
        hlc: mutation.hlc,
        options: { channel: session },
      });
    }
  }
});

// 3. Seed initial state using the elegant bindState API
const visitCounter = usp.bindState('visit_counter', { channel: 'todos' });
const globalNotice = usp.bindState('global_notice', { channel: 'todos' });

// We can just use the handles to safely set state!
// Nitro targets es2019 by default which doesn't support top-level await, so we just use .catch()
visitCounter.set(0).catch(console.error);
globalNotice.set('Welcome! Max 35 bytes.').catch(console.error);
