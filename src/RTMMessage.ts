import { RTMMessageResponse } from "./RTMMessageResponse";

export interface RTMMessage<T> {
  type: "auth" | "invoke";
  function?: string;
  data?: any;
  id: string;
  response?: (data: T) => void;
}
