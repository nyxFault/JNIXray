export interface WireLog {
  stream: "stdout" | "stderr" | "meta";
  data: string;
  ts: number;
}
export interface WireMessage {
  type: "log" | "status" | "snapshot";
  payload: any;
}

export function openTraceSocket(
  id: string,
  onMessage: (msg: WireMessage) => void,
  onClose?: () => void,
): WebSocket {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws/sessions/${id}`);
  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data) as WireMessage;
      onMessage(msg);
    } catch {}
  });
  ws.addEventListener("close", () => onClose?.());
  return ws;
}
