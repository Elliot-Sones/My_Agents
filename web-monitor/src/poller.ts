import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { createTwoFilesPatch } from "diff";
import { getAllMonitors, updateMonitor } from "./storage.js";
import type { Monitor, DiffResult } from "./types.js";

const MAX_HISTORY = 50;

export function extractContent(html: string, selector: string | null): string {
  if (selector) {
    const $ = cheerio.load(html);
    const elements = $(selector);
    if (elements.length === 0) {
      return "";
    }
    return elements.text().trim();
  }
  // Strip HTML tags for full body, return text content
  const $ = cheerio.load(html);
  return $("body").text().trim() || $.text().trim();
}

export function computeHash(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

export function computeDiff(oldContent: string | null, newContent: string): string {
  if (!oldContent) {
    return "Initial content captured";
  }
  return createTwoFilesPatch("previous", "current", oldContent, newContent, "", "", {
    context: 3,
  });
}

export async function checkMonitor(monitor: Monitor): Promise<DiffResult> {
  const response = await fetch(monitor.url, {
    headers: {
      "User-Agent": "web-monitor-mcp/1.0",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const content = extractContent(html, monitor.selector);

  if (!content) {
    throw new Error(
      monitor.selector
        ? `Selector "${monitor.selector}" matched no content`
        : "Page returned no text content"
    );
  }

  const newHash = computeHash(content);
  const changed = monitor.last_hash !== null && monitor.last_hash !== newHash;
  const diff = changed ? computeDiff(monitor.last_content, content) : null;
  const snippet = content.substring(0, 200);

  return {
    changed,
    old_hash: monitor.last_hash,
    new_hash: newHash,
    diff,
    snippet,
    content,
  };
}

export async function pollMonitor(monitor: Monitor): Promise<void> {
  try {
    const result = await checkMonitor(monitor);
    const now = Date.now();

    monitor.last_checked = now;
    monitor.check_count++;
    monitor.last_error = null;
    monitor.status = "active";

    if (result.changed) {
      monitor.last_changed = now;
      monitor.change_count++;
      monitor.history.push({
        timestamp: now,
        hash: result.new_hash,
        diff: result.diff || "",
        snippet: result.snippet,
      });
      // Trim history to last MAX_HISTORY entries
      if (monitor.history.length > MAX_HISTORY) {
        monitor.history = monitor.history.slice(-MAX_HISTORY);
      }
    }

    // Always update hash and content (including first check)
    monitor.last_hash = result.new_hash;
    monitor.last_content = result.content;

    updateMonitor(monitor);
  } catch (err) {
    monitor.last_error = err instanceof Error ? err.message : String(err);
    monitor.status = "error";
    monitor.last_checked = Date.now();
    updateMonitor(monitor);
  }
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(): void {
  if (pollInterval) return;

  console.error("[poller] Starting background polling (60s tick)...");

  pollInterval = setInterval(async () => {
    const monitors = getAllMonitors();
    const now = Date.now();

    for (const monitor of Object.values(monitors)) {
      if (monitor.status === "paused") continue;

      const lastChecked = monitor.last_checked ?? 0;
      const intervalMs = monitor.interval_seconds * 1000;

      if (now - lastChecked >= intervalMs) {
        console.error(`[poller] Checking: ${monitor.label || monitor.url}`);
        await pollMonitor(monitor);
      }
    }
  }, 60_000);
}

export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
