import assert from 'assert';
import fs from 'fs';
import { MemoryAdapter } from './src/adapter.js';
import { USPClient } from './src/client.js';
import { initSync, WasmHlc, WasmLwwMap, validate_security } from './wasm/usp_wasm.js';

// Synchronously initialize the WASM runtime in Node.js
const wasmBuffer = fs.readFileSync(new URL('./wasm/usp_wasm_bg.wasm', import.meta.url));
initSync({ module: wasmBuffer });

async function runTests() {
  console.log('🧪 Starting USP JS & WASM integration tests...');

  // 1. Test WASM Security Validation
  assert.strictEqual(validate_security('user.theme'), true, 'Public key should be allowed');
  assert.strictEqual(validate_security('private.api_key'), false, 'Private key should be rejected');
  console.log('✅ WASM Security validation passed');

  // 2. Test WasmHlc
  const hlc1 = new WasmHlc('nodeA');
  const ts1 = hlc1.incNow();
  console.log('   WasmHlc timestamp 1:', ts1);
  assert.ok(ts1.endsWith('-nodeA'), 'Should end with nodeA');
  
  const hlc2 = WasmHlc.fromTimestamp('nodeB', 2000000000000, 5);
  const ts2 = hlc2.pack();
  assert.strictEqual(WasmHlc.compare(ts1, ts2), -1, 'hlc1 should be less than hlc2');
  console.log('✅ WasmHlc timestamp generation and comparison passed');

  // 3. Test WasmLwwMap & Tombstones in WASM
  const lwwMap = new WasmLwwMap();
  const setMut = JSON.stringify({ op: 'SET', session: 's1', key: 'title', val: 'Hello USP', clientId: 'nodeA', hlc: '1700000000000-0000-nodeA' });
  assert.strictEqual(lwwMap.applyMutation(setMut, 'nodeA'), true, 'Newer SET mutation should apply');
  
  const delMut = JSON.stringify({ op: 'DELETE', session: 's1', key: 'title', clientId: 'nodeB', hlc: '1800000000000-0000-nodeB' });
  assert.strictEqual(lwwMap.applyMutation(delMut, 'nodeB'), true, 'Newer DELETE mutation should apply tombstone');
  
  const oldSetMut = JSON.stringify({ op: 'SET', session: 's1', key: 'title', val: 'Resurrect attempt', clientId: 'nodeC', hlc: '1750000000000-0000-nodeC' });
  assert.strictEqual(lwwMap.applyMutation(oldSetMut, 'nodeC'), false, 'Older SET should be rejected by tombstone');
  
  const jsonOutput = JSON.parse(lwwMap.toJson());
  assert.strictEqual(jsonOutput.title, undefined, 'Title should remain deleted');
  console.log('✅ WasmLwwMap tombstone protection passed');

  // 4. Test MemoryAdapter with Tombstones
  const adapter = new MemoryAdapter();
  await adapter.set('sess1', 'color', 'blue', '1000-0001-node1');
  const res1 = await adapter.getState('sess1');
  assert.strictEqual(res1.color, 'blue');

  await adapter.delete('sess1', 'color', '2000-0001-node2');
  const res2 = await adapter.getState('sess1');
  assert.strictEqual(res2.color, undefined, 'Color should be deleted in getState');

  // Try out-of-order older SET on MemoryAdapter
  const appliedOld = await adapter.set('sess1', 'color', 'red', '1500-0001-node1');
  assert.strictEqual(appliedOld, false, 'Older set should be rejected by MemoryAdapter tombstone');
  const res3 = await adapter.get('sess1', 'color');
  assert.strictEqual(res3, undefined, 'Color should still be undefined');
  console.log('✅ MemoryAdapter tombstone out-of-order protection passed');

  // 5. Test USPClient HLC Sync & offline queue
  const client = new USPClient('http://localhost:3000/api/usp');
  const hlcStr1 = client.generateHlc();
  console.log('   Client generated HLC:', hlcStr1);
  assert.ok(hlcStr1.includes('-0001-'), 'Should increment counter cleanly with base36 formatting');
  
  client.receiveHlc('9999999999999-000a-other');
  assert.strictEqual(client.lastTs, 9999999999999, 'Client logical clock should jump forward to remote timestamp');
  assert.strictEqual(client.hlcCounter, 11, 'Client logical counter should increment past remote counter');
  console.log('✅ USPClient HLC synchronization passed');

  console.log('🚀 All USP JS & WASM integration tests completed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failure:', err);
  process.exit(1);
});
