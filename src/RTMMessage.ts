export interface RTMMessage<T> {
  type: "auth" | "invoke" | "subscribe";
  function?: string;
  data?: any;
  event?: string;
  tags?: string[];
  id: string;
  response?: (data: T) => void;
  reject?: (error: any) => void;
}
