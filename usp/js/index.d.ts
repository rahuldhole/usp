export interface USPServer {
  registerAction(action: string, handler: (session: any) => Promise<any> | any): void;
  start(): Promise<void>;
}

export declare const USP: {
  initServer(options?: { redisUrl?: string; port?: number }): Promise<USPServer>;
  initClient(options?: { url?: string }): Promise<any>;
  useUsp(session: any): any;
  exec(session: any, action: string, callback?: Function): void;
};
