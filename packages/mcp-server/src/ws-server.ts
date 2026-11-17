import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  UiToServerMessageSchema,
  type FlowGraphPayload,
} from "@flowguard/shared";
import { serverState, setUiSelection } from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST_DIR = path.resolve(__dirname, "../../visualizer-ui/dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

const wsState: {
  wss: WebSocketServer | null;
  activePort: number | null;
} = {
  wss: null,
  activePort: null,
};

async function serveStatic(
  reqUrl: string,
  res: http.ServerResponse
): Promise<void> {
  const cleanUrl = (reqUrl.split("?")[0] || "/").replace(/^\/+/, "");
  const relPath = cleanUrl === "" ? "index.html" : cleanUrl;
  const target = path.resolve(UI_DIST_DIR, relPath);

  if (!target.startsWith(UI_DIST_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    try {
      const fallback = await fs.readFile(path.join(UI_DIST_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fallback);
    } catch {
      res.writeHead(404).end("Visualizer UI not built. Run pnpm build first.");
    }
  }
}

export async function startVisualizerServer(
  preferredPort = 4123
): Promise<number | null> {
  for (let port = preferredPort; port < preferredPort + 10; port++) {
    const started = await tryBindPort(port);
    if (started) {
      wsState.activePort = port;
      console.error(`[FlowGuard] Visualizer UI + WebSocket running at http://localhost:${port}`);
      return port;
    }
  }
  console.error("[FlowGuard] Could not bind visualizer port 4123-4132; continuing in headless MCP mode.");
  return null;
}

function tryBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      void serveStatic(req.url ?? "/", res);
    });

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        console.error("[FlowGuard] HTTP server error:", err.message);
        resolve(false);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      const wsServer = new WebSocketServer({ server });
      wsState.wss = wsServer;

      wsServer.on("connection", (socket) => {
        if (serverState.currentGraph) {
          socket.send(
            JSON.stringify({
              type: "GRAPH_UPDATE",
              payload: serverState.currentGraph,
            })
          );
        }

        socket.on("message", (raw) => {
          try {
            const parsed = JSON.parse(raw.toString());
            const msg = UiToServerMessageSchema.safeParse(parsed);
            if (msg.success && msg.data.type === "UI_SELECTION") {
              setUiSelection(msg.data.payload);
            }
          } catch {
            // Ignore malformed client messages
          }
        });
      });

      resolve(true);
    });
  });
}

export function broadcastGraphUpdate(payload: FlowGraphPayload): void {
  if (!wsState.wss) return;
  const frame = JSON.stringify({ type: "GRAPH_UPDATE", payload });
  for (const client of wsState.wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(frame);
    }
  }
}

export function getVisualizerUrl(): string | null {
  return wsState.activePort ? `http://localhost:${wsState.activePort}` : null;
}
