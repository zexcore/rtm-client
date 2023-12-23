import { RTMClientOptions } from "./RTMClientOptions";

export interface RTMClient {
  getSocket: () => WebSocket;
  closeClient: () => void | Promise<any>;
  //authenticate: <T>(token: string) => Promise<T>;
  /**
   * Returns true if the current client is authenticated with the provided authenticationData
   * @returns
   */
  isAuthenticated: () => boolean;
  /**
   * If authenticated, returns the authenticate data sent from the server.
   * @returns
   */
  auth?: () => any;
  options?: RTMClientOptions;
  callWait: <T>(func: string, ...params: any[]) => Promise<T>;
  call: (func: string, ...params: any[]) => Promise<void>;
  subscribe: (
    event: string,
    callback: (...data: any[]) => Promise<void> | void
  ) => () => void;
  subscribePush: (
    event: string,
    tags: string[],
    callback: (...data: any[]) => Promise<void> | void
  ) => void;
}
