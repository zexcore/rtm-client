export interface RTMClientOptions {
  /**
   * Send with the authentication message after successful connection attempt.
   */
  authenticationData?: any;

  /**
   * Called every time the connection is opened. Only called after a successful authentication.
   * @returns
   */
  onOpen?: () => void;

  /**
   * Called every time the connection is closed.
   * @returns
   */
  onClose?: () => void;

  /**
   * Called every time there is an error in the socket.
   * @returns
   */
  onError?: (err: {
    code: "rtm/auth-error" | "rtm/network-error" | "rtm/unknown-error";
    data?: any;
  }) => void;

  /**
   * Called before the reconnecting attempt is made.
   * @param attempt
   * @returns
   */
  onReconnecting?: (attempt: number) => void;

  /**
   * Interval in milliseconds to wait after each reconnect attempt. Set to 0 to disable auto reconnect.
   */
  reconnectDelayMs?: number;

  onMessage?: (raw: string) => void;
}
