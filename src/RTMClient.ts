export interface RTMClient {
  getSocket: () => WebSocket;
  closeClient: () => void | Promise<any>;
  authenticate: <T>(token: string) => Promise<T>;
  isAuthenticated: () => boolean;
  options?: {};
  callWait: <T>(func: string, ...params: any[]) => Promise<T>;
  call: (func: string, ...params: any[]) => Promise<void>;
  subscribe: (
    event: string,
    callback: (...data: any[]) => Promise<void> | void
  ) => () => void;
}
