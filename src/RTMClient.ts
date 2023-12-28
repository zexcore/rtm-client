import { RTMClientOptions } from "./RTMClientOptions";
import { RTMMessage } from "./RTMMessage";
import {
  RTMMessageResponse,
  RTMSubscriptionMessage,
} from "./RTMMessageResponse";
import { RTMUtils } from "./utils";

/**
 * Provides asynchronous RTM functions and events
 */
export class RtmClient {
  Socket: WebSocket;
  InvokeQueue: Map<string, RTMMessage<any>> = new Map();
  MessageQueue: RTMMessage<any>[] = [];
  Options: RTMClientOptions;
  // Main key is eventName, secondary key is a unique ID of each subscriber used to unsubscribe.
  Subscriptions: Map<
    string,
    Map<string, (...data: any[]) => Promise<void> | void>
  > = new Map();
  Address: string;

  #reconnectAttempt = 0;
  Authenticated = false;

  /**
   * Creates a new instance of RtmClient connected with a specified server, with specified options.
   */
  constructor(address: string, options?: RTMClientOptions) {
    if (!global.WebSocket) {
      try {
        Object.assign(global, { WebSocket: require("ws") });
      } catch (err: any) {
        console.warn(
          "Error initializing client library. If you are running under nodejs, please run 'npm install ws'. "
        );
        console.error("ERROR: ", err);
        throw new Error("Module not found (WebSocket)");
      }
    }
    this.Options = options || {
      reconnectDelayMs: 1000,
    };
    this.Address = address;
    this.Socket = new WebSocket(address);
    this.Socket.addEventListener("open", this.#onSocketConnected.bind(this));
    this.Socket.addEventListener("close", this.#onSocketClose.bind(this));
    this.Socket.addEventListener("error", (ev) => {
      options?.onError?.({ code: "rtm/network-error", data: ev });
    });
    this.Socket.addEventListener("message", this.#onMessage.bind(this));
  }

  async #onSocketConnected() {
    // Attempt to authenticate.
    if (this.Options.authenticationData) {
      this.Options.onAuthenticating?.();
      // Authenticate.
      const data = await this.#authenticate(this.Options.authenticationData);
      if (data) {
        this.Authenticated = true;
      } else {
        this.Options.onError?.({
          code: "rtm/auth-error",
          data: "Server returned an invalid response.",
        });
        this.Authenticated = false;
        this.Close();
        return;
      }
    }
    this.Options?.onOpen?.();
    // Process any queued msgs
    if (this.MessageQueue.length > 0) {
      for (let m of this.MessageQueue) {
        this.Socket.send(JSON.stringify(m));
      }
    }
    this.MessageQueue = [];
    this.#reconnectAttempt = 0;
  }

  #onSocketClose() {
    this.Authenticated = false;
    this.Options?.onClose?.();
    if (this.Options?.reconnectDelayMs && this.Options.reconnectDelayMs > 0)
      this.#reconnect();
  }

  async #reconnect() {
    // wait for the delay
    await new Promise((resolve) =>
      setTimeout(resolve, this.Options.reconnectDelayMs)
    );
    this.#reconnectAttempt += 1;
    this.Options.onReconnecting?.(this.#reconnectAttempt);
    this.Socket = new WebSocket(this.Address);
    this.Socket.addEventListener("open", this.#onSocketConnected.bind(this));
    this.Socket.addEventListener("close", this.#onSocketClose.bind(this));
    this.Socket.addEventListener("error", (ev) => {
      this.Options?.onError?.({ code: "rtm/network-error", data: ev });
    });
    this.Socket.addEventListener("message", this.#onMessage.bind(this));
  }

  async #onMessage(msg: any) {
    const _raw = JSON.parse(msg.data.toString());
    this.Options.onMessage?.(msg.data.toString());
    if (_raw.event) {
      // This is an event.
      let _smsg = new RTMSubscriptionMessage(_raw);
      this.#onSubscriptionMessage(_smsg);
    } else {
      let _msg = new RTMMessageResponse(msg.data.toString());
      this.#onMessageResponse(_msg);
    }
  }

  #onSubscriptionMessage(msg: RTMSubscriptionMessage<any>) {
    // Get the subscriber (if any)
    const subs = this.Subscriptions.get(msg.event);
    if (subs) {
      // Iterate all
      for (let s of subs.values()) {
        s(...msg.data);
      }
    }
  }

  #onMessageResponse(msg: RTMMessageResponse<any>) {
    // Get the message promise from queue
    const msgInfo = this.InvokeQueue.get(msg.id);
    // If the message is error, we call on reject with its data.
    if (msg.data?.error) {
      msgInfo?.reject?.(msg.data.error);
    } else {
      msgInfo?.response?.(msg.data);
    }
  }

  async #authenticate<T>(...params: any[]) {
    return new Promise<T>(async (resolve, reject) => {
      // Construct a new message
      let msg: RTMMessage<T> = {
        id: RTMUtils.uuidv4(),
        type: "auth",
        data: params,
        response: resolve,
        reject: reject,
      };
      // add the message to the message queue
      this.InvokeQueue.set(msg.id, msg);
      // Send the message
      this.Socket.send(JSON.stringify(msg));
    });
  }

  async #waitForReadyState() {
    return new Promise((resolve) => {
      const _wait = () => {
        if (this.Socket.readyState === this.Socket.OPEN) {
          resolve(true);
        } else {
          setTimeout(_wait, 100);
        }
      };
      setTimeout(_wait, 100);
    });
  }

  // Public Functions

  /**
   * Subscribe to the push events. Push subscriptions are created and managed on server side.
   */
  async SubscribePush(
    eventName: string,
    tags: string[],
    callback: (...data: any[]) => void
  ) {
    return new Promise(async (resolve, reject) => {
      await this.#waitForReadyState();
      // Construct a new message
      let msg: RTMMessage<any> = {
        id: RTMUtils.uuidv4(),
        type: "subscribe",
        event: eventName,
        tags: tags,
        response: (data) => {
          resolve(() => this.Subscriptions.get(eventName)?.delete(id));
        },
        reject: reject,
      };
      // add the message to the message queue
      this.InvokeQueue.set(msg.id, msg);
      // Send the message
      this.Socket.send(JSON.stringify(msg));
      // Generate an ID of the subscriber
      const id = RTMUtils.uuidv4();
      if (!this.Subscriptions.has(eventName)) {
        // Create a new map
        this.Subscriptions.set(eventName, new Map());
      }
      this.Subscriptions.get(eventName)!.set(id, callback);
    });
  }

  /**
   * Registers a function to execute when a specific event is received from server. The returned function can be used to unsubscribe. Note that this subscription is client side only.
   * @param event
   * @param callback
   */
  Subscribe(event: string, callback: (...data: any[]) => void | Promise<void>) {
    // Generate an ID of the subscriber
    const id = RTMUtils.uuidv4();
    if (!this.Subscriptions.has(event)) {
      // Create a new map
      this.Subscriptions.set(event, new Map());
    }
    this.Subscriptions.get(event)!.set(id, callback);
    // return an unsubscribe hook
    return () => this.Subscriptions.get(event)?.delete(id);
  }

  /**
   * Executes a named function on the server. This is a fire-and-forget kind of function so don't expect
   * the results back.
   */
  async Call<T>(func: string, ...data: any[]) {
    // Construct a new message
    let msg: RTMMessage<T> = {
      id: RTMUtils.uuidv4(),
      type: "invoke",
      data: data,
      function: func,
    };
    // add the message to the message queue
    this.InvokeQueue.set(msg.id, msg);
    // If we are not in ready State, and if message queue is enabled, we add this msg to the que
    if (this.Socket.readyState !== this.Socket.OPEN) {
      this.MessageQueue.push(msg);
    } else {
      // Send the message
      this.Socket.send(JSON.stringify(msg));
    }
  }

  /**
   * Executes a named function on the server and returns the results.
   * @param token
   * @returns Promise that is resolved when the response is received from the server.
   */
  async CallWait<T>(func: string, ...data: any[]) {
    return new Promise<T>((resolve, reject) => {
      try {
        // Construct a new message
        let msg: RTMMessage<T> = {
          id: RTMUtils.uuidv4(),
          type: "invoke",
          data: data,
          response: resolve,
          function: func,
          reject: reject,
        };
        // add the message to the message queue
        this.InvokeQueue.set(msg.id, msg);
        // If we are not in ready State, and if message queue is enabled, we add this msg to the que
        if (this.Socket.readyState !== this.Socket.OPEN) {
          this.MessageQueue.push(msg);
        } else {
          // Send the message
          this.Socket.send(JSON.stringify(msg));
        }
      } catch (err: any) {
        reject(err);
      }
    });
  }

  /**
   * Clears the local cache and closes the WebSocket connection. The client may not be used again after this call.
   */
  Close() {
    this.Options.reconnectDelayMs = 0;
    this.Options = {};
    this.Authenticated = false;
    this.#reconnectAttempt = 0;
    this.InvokeQueue.clear();
    this.MessageQueue = [];
    this.Subscriptions.clear();
    this.Socket.close();
  }
}
