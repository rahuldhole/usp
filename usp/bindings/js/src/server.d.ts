export interface USPServerOptions {
  channel?: string;
  password?: string;
  access?: 'global' | 'server' | 'client';
  mode?: 'duplex' | 'simplex-server-to-client' | 'simplex-client-to-server' | 'half-duplex';
}

export interface StateBindingServer<T = any> {
  get(): Promise<T | undefined>;
  set(val: T): Promise<void>;
}

export class USPServer {
  constructor(adapter: any);
  registerAction(action: string, handler: (channel: string, adapter: any, mutation: any) => Promise<void>): void;
  handleSync(req: any, res: any): Promise<void>;
  handleSubscribe(req: any, res: any): Promise<void>;
  broadcast(mutation: any): void;
  getState<T = any>(key: string, options?: USPServerOptions): Promise<T | undefined>;
  setState<T = any>(key: string, val: T, options?: USPServerOptions): Promise<void>;
  bindState<T = any>(key: string, options?: USPServerOptions): StateBindingServer<T>;
}
