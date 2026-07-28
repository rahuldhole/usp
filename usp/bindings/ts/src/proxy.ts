import { validate_security } from '../wasm/usp_wasm.js';

export function createUspProxy(session, scope, target, client) {
  return new Proxy(target, {
    set(obj, prop, value) {
      if (typeof prop !== 'string') return Reflect.set(obj, prop, value);
      
      // Call WASM security validation synchronously
      if (!validate_security(prop)) {
        throw new Error(`Forbidden: Cannot mutate private namespace key '${prop}' from client`);
      }

      obj[prop] = value;
      
      // Notify local listeners for instantaneous UI rendering (optimistic update)
      if (typeof client.notifyListeners === 'function') {
        client.notifyListeners();
      }

      // Dispatch mutation via client
      client.dispatchSync({
        op: 'SET',
        session,
        scope,
        key: prop,
        val: value
      });
      return true;
    },
    deleteProperty(obj, prop) {
      if (typeof prop !== 'string') return Reflect.deleteProperty(obj, prop);
      
      // Call WASM security validation synchronously
      if (!validate_security(prop)) {
        throw new Error(`Forbidden: Cannot delete private namespace key '${prop}' from client`);
      }

      delete obj[prop];
      
      // Notify local listeners
      if (typeof client.notifyListeners === 'function') {
        client.notifyListeners();
      }

      client.dispatchSync({
        op: 'DELETE',
        session,
        scope,
        key: prop
      });
      return true;
    }
  });
}
