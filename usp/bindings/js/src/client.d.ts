export interface USPClientOptions {
  channel?: string;
  password?: string;
  access?: 'global' | 'server' | 'client';
  mode?: 'duplex' | 'simplex-server-to-client' | 'simplex-client-to-server' | 'half-duplex';
  initialState?: any;
}

export interface StateBinding<T = any> {
  value: T;
}

export class USPClient {
  constructor(endpoint: string);
  connect(channels: string[]): void;
  bindState<T = any>(key: string, options?: USPClientOptions): StateBinding<T>;
  subscribe(fn: (states: Record<string, any>) => void): () => void;
  dispatchSync(mutation: any): Promise<void>;
  applyMutation(mutation: any): void;
}
