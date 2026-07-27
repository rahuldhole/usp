// The Proxy engine that intercepts state reads and writes

export function createUspProxy(session, targetObj, manager) {
  return new Proxy(targetObj, {
    get(target, prop) {
      // Direct local read for sub-millisecond access
      return target[prop];
    },
    set(target, prop, value) {
      // Update local memory cache immediately
      target[prop] = value;
      
      // Dispatch sync to the manager (Server writes to Redis, Client writes to WebSocket)
      manager.dispatchSync(session, prop, value);
      
      return true;
    }
  });
}
