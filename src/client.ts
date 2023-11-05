import { RTMMessage } from "./RTMMessage";
import { RTMMessageResponse } from "./RTMMessageResponse";
import { RTMUtils } from "./utils";
let Socket: WebSocket;
let InvokeQueue: Map<string, RTMMessage<any>> = new Map();
let authenticated = false;

export interface RTMClient {
  Socket: WebSocket;
  closeClient: () => void | Promise<any>;
  authenticate: <T>(token: string) => Promise<T>;
  isAuthenticated: () => boolean;
  options?: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: () => void;
  };
  callWait: <T>(func: string, ...params: any[]) => Promise<T>;
  call: (func: string, ...params: any[]) => Promise<void>;
}

/**
 * Creates a new RTM Client
 * @param address
 * @param options
 */
export function createClient(
  address: string,
  options?: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: () => void;
  }
): RTMClient {
  Socket = new WebSocket(address);
  Socket.addEventListener("open", () => {
    options?.onOpen?.();
  });
  Socket.addEventListener("close", () => {
    options?.onClose?.();
  });
  Socket.addEventListener("error", (ev) => {
    options?.onError?.();
  });
  Socket.addEventListener("message", (msg) => {
    let _msg = new RTMMessageResponse(msg.data.toString());
    onMessageResponse(_msg);
  });
  return {
    Socket: Socket,
    closeClient: closeClient,
    authenticate: authenticate,
    options: options,
    call: Call,
    callWait: CallWait,
    isAuthenticated() {
      return authenticated;
    },
  };
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
  msgInfo?.response?.(msg.data);
}

/**
 * Performs an authentication using a token. Returns a promise that is resolved when authentication succeeds.
 */
async function authenticate<T>(token: string) {
  return new Promise<T>(async (resolve, reject) => {
    await waitForReadyState();
    // Construct a new message
    let msg: RTMMessage<T> = {
      id: RTMUtils.uuidv4(),
      type: "auth",
      data: token,
      response: resolve,
    };
    // add the message to the message queue
    InvokeQueue.set(msg.id, msg);
    // Send the message
    Socket.send(JSON.stringify(msg));
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
  return new Promise<T>(async (resolve, reject) => {
    await waitForReadyState();
    // Construct a new message
    let msg: RTMMessage<T> = {
      id: RTMUtils.uuidv4(),
      type: "invoke",
      data: data,
      response: resolve,
      function: func,
    };
    // add the message to the message queue
    InvokeQueue.set(msg.id, msg);
    // Send the message
    Socket.send(JSON.stringify(msg));
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
