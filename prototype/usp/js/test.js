import { HLC } from './src/hlc.js';
import { MemoryAdapter } from './src/adapters/MemoryAdapter.js';

async function run() {
  const hlc1 = new HLC('clientA');
  const hlc2 = new HLC('clientB');

  const ts1 = hlc1.inc();
  console.log('ts1:', ts1);

  // simulate network delay
  await new Promise(r => setTimeout(r, 10));
  
  const ts2 = hlc2.inc();
  console.log('ts2:', ts2);

  console.log('Compare ts2 > ts1:', HLC.compare(ts2, ts1) > 0);

  const adapter = new MemoryAdapter();
  await adapter.init();
  
  const ok1 = await adapter.set('session1', 'key1', 'val1', ts1);
  console.log('adapter set ts1:', ok1);
  
  const ok2 = await adapter.set('session1', 'key1', 'val2', ts2);
  console.log('adapter set ts2:', ok2);
  
  // Try to set older timestamp
  const ok3 = await adapter.set('session1', 'key1', 'val-old', ts1);
  console.log('adapter set ts1 again (should be false):', ok3);
  
  console.log('Final state:', await adapter.getSessionState('session1'));
}

run();
