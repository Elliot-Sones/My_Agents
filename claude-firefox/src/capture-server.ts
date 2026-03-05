import { createServer } from "http";
import { writeFileSync, mkdirSync } from "fs";

export interface CaptureServerConfig {
  homeDir: string;
  captureFile: string;
  captureHost: string;
  capturePort: number;
}

export function startCaptureServer(config: CaptureServerConfig): void {
  mkdirSync(config.homeDir, { recursive: true });

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
          writeFileSync(config.captureFile, text, "utf8");
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

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" || err.code === "EACCES" || err.code === "EPERM") {
      process.stderr.write(
        `[capture] Capture server disabled (${err.code}) at ${config.captureHost}:${config.capturePort}\n`
      );
      return;
    }
    process.stderr.write(`[capture] Capture server error: ${err.message}\n`);
  });

  server.listen(config.capturePort, config.captureHost, () => {
    process.stderr.write(
      `[capture] HTTP capture server on ${config.captureHost}:${config.capturePort}\n`
    );
  });
}
