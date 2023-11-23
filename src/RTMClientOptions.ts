export interface RTMClientOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
  onReconnect?: (attempt: number) => void;

  /**
   * Interval in milliseconds to wait after each reconnect attempt. Set to 0 to disable auto reconnect.
   */
  reconnectDelayMs?: number;

  /**
   * If enabled, messages sent via the call functions are queued until the connection has Ready state.
   */
  enableMessageQueue?: boolean;

  onMessage?: (raw: string) => void;
}
