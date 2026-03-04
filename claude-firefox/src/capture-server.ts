import { createServer } from "http";
import { writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CAPTURE_PORT = 7866;
const captureDir = join(homedir(), ".claude-firefox");

export function startCaptureServer() {
  mkdirSync(captureDir, { recursive: true });

  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/capture") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const timestamp = new Date().toISOString();
          const text = `URL: ${data.url}\nTitle: ${data.title}\nCaptured: ${timestamp}\n\n${data.content}`;
          writeFileSync(join(captureDir, "page-context.txt"), text, "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(CAPTURE_PORT, "127.0.0.1", () => {
    process.stderr.write(`[capture] HTTP capture server on port ${CAPTURE_PORT}\n`);
  });
}
