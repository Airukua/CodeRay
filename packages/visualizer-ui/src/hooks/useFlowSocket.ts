import { useCallback, useEffect, useRef, useState } from "react";
import {
  ServerToUiMessageSchema,
  type FlowGraphPayload,
  type UiSelection,
} from "@flowguard/shared";
import { MOCK_GRAPH_PAYLOAD } from "../data/mockGraph";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export function useFlowSocket() {
  const [graph, setGraph] = useState<FlowGraphPayload>(MOCK_GRAPH_PAYLOAD);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host || "localhost:4123";
      const url = `${protocol}//${host}`;

      setStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data));
          const msg = ServerToUiMessageSchema.safeParse(parsed);
          if (msg.success && msg.data.type === "GRAPH_UPDATE") {
            setGraph(msg.data.payload);
          }
        } catch {
          // Ignore malformed non-JSON messages
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const sendSelection = useCallback((selection: Omit<UiSelection, "timestamp">) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "UI_SELECTION",
        payload: {
          ...selection,
          timestamp: new Date().toISOString(),
        },
      })
    );
  }, []);

  return { graph, status, sendSelection };
}
