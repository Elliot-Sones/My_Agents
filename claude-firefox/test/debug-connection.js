// Minimal debug server - logs every WebSocket message
import { WebSocketServer } from "ws";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SECRET = readFileSync(join(homedir(), ".claude-firefox", "secret.txt"), "utf-8").trim();
console.log(`Secret: ${SECRET}`);
console.log(`Waiting for connections on ws://localhost:7865...\n`);

const wss = new WebSocketServer({ port: 7865, host: "127.0.0.1" });

wss.on("connection", (ws, req) => {
  console.log(`[CONNECTED] from ${req.socket.remoteAddress}`);

  ws.on("message", (data) => {
    const raw = data.toString();
    console.log(`[RECV] ${raw}`);

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "auth") {
      // Try both formats: { secret: "..." } and { params: { secret: "..." } }
      const secret = msg.params?.secret || msg.secret;
      const valid = secret === SECRET;
      console.log(`[AUTH] secret=${secret?.slice(0, 8)}... valid=${valid}`);
      ws.send(JSON.stringify({ id: msg.id || "auth", type: "response", result: { ok: valid } }));
      if (!valid) {
        console.log("[AUTH] Closing connection (bad secret)");
        ws.close();
      }
    }

    if (msg.type === "ping") {
      console.log("[PING] received");
      ws.send(JSON.stringify({ id: msg.id, type: "pong" }));
    }
  });

  ws.on("close", (code) => {
    console.log(`[DISCONNECTED] code=${code}`);
  });

  ws.on("error", (err) => {
    console.log(`[ERROR] ${err.message}`);
  });
});
