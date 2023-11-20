/**
 * Represents a response from the server.
 */
export class RTMMessageResponse<T> {
  data: T;
  id: string;

  constructor(rawMessage: string) {
    const _msg = JSON.parse(rawMessage);
    this.data = _msg.data;
    this.id = _msg.id;
  }
}

export class RTMSubscriptionMessage<T> {
  data: T;
  event: string;

  constructor(raw: any) {
    this.data = raw.data;
    this.event = raw.event;
  }
}
