export interface USPServer {
  registerAction(action: string, handler: (session: any) => Promise<any> | any): void;
  handlePost(body: any): Promise<any>;
  subscribe(session: string, send: (event: string, data: any) => void, onClose: () => void): { clientId: string; unsubscribe: () => void };
  getSessionState(session: string): Record<string, string>;
  syncState(session: string, key: string, value: string): void;
  start(): Promise<void>;
}

export declare const USP: {
  initServer(options?: { dbPath?: string }): Promise<USPServer>;
  initClient(options?: { baseUrl?: string }): Promise<any>;
  useUsp(session: any): any;
  onSync(callback: (session: string, key: string, value: any) => void): void;
  _getServer(): USPServer | null;
  exec(session: any, action: string, callback?: Function): void;
};
