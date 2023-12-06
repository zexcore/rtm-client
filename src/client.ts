import { RTMClient } from "./RTMClient";
import { RTMClientOptions } from "./RTMClientOptions";
import { RTMMessage } from "./RTMMessage";
import {
  RTMMessageResponse,
  RTMSubscriptionMessage,
} from "./RTMMessageResponse";
import { RTMUtils } from "./utils";
let Socket: WebSocket;
let InvokeQueue: Map<string, RTMMessage<any>> = new Map();
let MessageQueue: RTMMessage<any>[] = [];
let authenticated = false;
let address: string;
let options: RTMClientOptions;
// Main key is eventName, secondary key is a unique ID of each subscriber used to unsubscribe.
let Subscriptions: Map<
  string,
  Map<string, (...data: any[]) => Promise<void> | void>
> = new Map();

let reconnectAttempt = 0;

/**
 * Creates a new RTM Client
 * @param address
 * @param options
 */
export function createClient(
  rtmAddress: string,
  rtmOptions?: RTMClientOptions
): RTMClient {
  Socket = new WebSocket(rtmAddress);
  Socket.addEventListener("open", () => {
    options?.onOpen?.();
    // Process any queued msgs
    if (MessageQueue.length > 0) {
      for (let m of MessageQueue) {
        Socket.send(JSON.stringify(m));
      }
    }
    MessageQueue = [];
  });
  Socket.addEventListener("close", () => {
    authenticated = false;
    options?.onClose?.();
    if (options?.reconnectDelayMs && options.reconnectDelayMs > 0) reconnect();
  });
  Socket.addEventListener("error", (ev) => {
    options?.onError?.();
  });
  Socket.addEventListener("message", (msg) => {
    const _raw = JSON.parse(msg.data.toString());
    if (options.onMessage) {
      options.onMessage(msg.data.toString());
    }
    if (_raw.event) {
      // This is an event.
      let _smsg = new RTMSubscriptionMessage(_raw);
      onSubscriptionMessage(_smsg);
    } else {
      let _msg = new RTMMessageResponse(msg.data.toString());
      onMessageResponse(_msg);
    }
  });
  if (rtmOptions) options = rtmOptions;
  address = rtmAddress;
  return {
    getSocket() {
      return Socket;
    },
    closeClient: closeClient,
    authenticate: authenticate,
    options: rtmOptions,
    call: Call,
    callWait: CallWait,
    isAuthenticated() {
      return authenticated;
    },
    subscribe: Subscribe,
    subscribePush: SubscribePush,
  };
}

async function reconnect() {
  // wait for the delay
  await new Promise((resolve) => setTimeout(resolve, options.reconnectDelayMs));
  reconnectAttempt += 1;
  options.onReconnect?.(reconnectAttempt);
  Socket = new WebSocket(address);
  Socket.addEventListener("open", () => {
    options?.onOpen?.();
    reconnectAttempt = 0;
  });
  Socket.addEventListener("close", () => {
    authenticated = false;
    options?.onClose?.();
    if (options?.reconnectDelayMs && options.reconnectDelayMs > 0) reconnect();
  });
  Socket.addEventListener("error", (ev) => {
    options?.onError?.();
  });
  Socket.addEventListener("message", (msg) => {
    const _raw = JSON.parse(msg.data.toString());
    if (_raw.event) {
      // This is an event.
      let _smsg = new RTMSubscriptionMessage(_raw);
      onSubscriptionMessage(_smsg);
    } else {
      let _msg = new RTMMessageResponse(msg.data.toString());
      onMessageResponse(_msg);
    }
  });
}

function onSubscriptionMessage(msg: RTMSubscriptionMessage<any>) {
  console.log("Event: " + msg.event);
  // Get the subscriber (if any)
  const subs = Subscriptions.get(msg.event);
  if (subs) {
    // Iterate all
    for (let s of subs.values()) {
      s(...msg.data);
    }
  }
}

/**
 * Called when a message response with a set id is resceived.
 * @param id
 */
function onMessageResponse(msg: RTMMessageResponse<any>) {
  // Get the message promise from queue
  const msgInfo = InvokeQueue.get(msg.id);
  if (msgInfo?.type === "auth") {
    // If the data is truthy, we set authenticated to true.
    authenticated = Boolean(msg.data);
  }
  // If the message is error, we call on reject with its data.
  if (msg.data?.error) {
    msgInfo?.reject?.(msg.data.error);
  } else {
    msgInfo?.response?.(msg.data);
  }
}

/**
 * Performs an authentication using a token. Returns a promise that is resolved when authentication succeeds.
 */
async function authenticate<T>(...params: any[]) {
  return new Promise<T>(async (resolve, reject) => {
    await waitForReadyState();
    // Construct a new message
    let msg: RTMMessage<T> = {
      id: RTMUtils.uuidv4(),
      type: "auth",
      data: params,
      response: resolve,
      reject: reject,
    };
    // add the message to the message queue
    InvokeQueue.set(msg.id, msg);
    // Send the message
    Socket.send(JSON.stringify(msg));
  });
}

/**
 * Subscribe to the push messages.
 */
async function SubscribePush(
  eventName: string,
  tags: string[],
  callback: (...data: any[]) => void
) {
  return new Promise(async (resolve, reject) => {
    await waitForReadyState();
    // Construct a new message
    let msg: RTMMessage<any> = {
      id: RTMUtils.uuidv4(),
      type: "subscribe",
      event: eventName,
      tags: tags,
      response(data) {
        resolve(() => Subscriptions.get(eventName)?.delete(id));
      },
      reject: reject,
    };
    // add the message to the message queue
    InvokeQueue.set(msg.id, msg);
    // Send the message
    Socket.send(JSON.stringify(msg));
    // Generate an ID of the subscriber
    const id = RTMUtils.uuidv4();
    if (!Subscriptions.has(eventName)) {
      // Create a new map
      Subscriptions.set(eventName, new Map());
    }
    Subscriptions.get(eventName)!.set(id, callback);
  });
}

/**
 * Executes a named function on the server. This is a fire-and-forget kind of function so don't expect
 * the results back.
 */
async function Call<T>(func: string, ...data: any[]) {
  await waitForReadyState();
  // Construct a new message
  let msg: RTMMessage<T> = {
    id: RTMUtils.uuidv4(),
    type: "invoke",
    data: data,
    function: func,
  };
  // add the message to the message queue
  InvokeQueue.set(msg.id, msg);
  // Send the message
  await Socket.send(JSON.stringify(msg));
}

/**
 * Executes a named function on the server and returns the results.
 * @param token
 * @returns Promise that is resolved when the response is received from the server.
 */
async function CallWait<T>(func: string, ...data: any[]) {
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
      InvokeQueue.set(msg.id, msg);
      // If we are not in ready State, and if message queue is enabled, we add this msg to the que
      if (Socket.readyState !== Socket.OPEN && options.enableMessageQueue) {
        MessageQueue.push(msg);
      } else {
        // Send the message
        Socket.send(JSON.stringify(msg));
      }
    } catch (err: any) {
      reject(err);
    }
  });
}

async function closeClient() {
  Socket.close();
}

async function waitForReadyState() {
  return new Promise((resolve) => {
    function _wait() {
      if (Socket.readyState === Socket.OPEN) {
        resolve(true);
      } else {
        setTimeout(_wait, 100);
      }
    }
    setTimeout(_wait, 100);
  });
}

/**
 * Registers a function to execute when a specific event is received from server. The returned function can be used to unsubscribe.
 * @param event
 * @param callback
 */
function Subscribe(
  event: string,
  callback: (...data: any[]) => void | Promise<void>
) {
  // Generate an ID of the subscriber
  const id = RTMUtils.uuidv4();
  if (!Subscriptions.has(event)) {
    // Create a new map
    Subscriptions.set(event, new Map());
  }
  Subscriptions.get(event)!.set(id, callback);
  // return an unsubscribe hook
  return () => Subscriptions.get(event)?.delete(id);
}
