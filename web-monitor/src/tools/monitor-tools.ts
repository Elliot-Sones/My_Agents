import { v4 as uuidv4 } from "uuid";
import type { ToolDef, Monitor } from "../types.js";
import {
  addMonitor,
  removeMonitor,
  getAllMonitors,
  getMonitor,
  updateMonitor,
} from "../storage.js";
import { checkMonitor } from "../poller.js";

export function monitorTools(): ToolDef[] {
  return [
    {
      name: "monitor_add",
      description:
        "Add a new web page monitor. The page will be periodically fetched and compared for changes. Optionally scope monitoring to a CSS selector.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL of the web page to monitor.",
          },
          selector: {
            type: "string",
            description:
              "Optional CSS selector to scope monitoring to a specific element.",
          },
          interval_seconds: {
            type: "number",
            description:
              "Check interval in seconds (default: 300 = 5 minutes).",
          },
          label: {
            type: "string",
            description: "Optional human-readable label for this monitor.",
          },
        },
        required: ["url"],
      },
      handler: async (params) => {
        const url = params.url as string;
        const selector = (params.selector as string) || null;
        const interval_seconds = (params.interval_seconds as number) || 300;
        const label = (params.label as string) || url;

        // Validate URL
        try {
          new URL(url);
        } catch {
          return { error: "Invalid URL provided" };
        }

        const id = uuidv4();
        const now = Date.now();

        const monitor: Monitor = {
          id,
          url,
          selector,
          interval_seconds,
          label,
          created: now,
          last_checked: null,
          last_changed: null,
          last_hash: null,
          last_content: null,
          check_count: 0,
          change_count: 0,
          status: "active",
          last_error: null,
          history: [],
        };

        addMonitor(monitor);

        return {
          monitor_id: id,
          url,
          selector,
          interval_seconds,
          label,
          status: "active",
          message: `Monitor created. Will check every ${interval_seconds} seconds.`,
        };
      },
    },
    {
      name: "monitor_remove",
      description: "Remove a web page monitor by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          monitor_id: {
            type: "string",
            description: "The monitor ID to remove.",
          },
        },
        required: ["monitor_id"],
      },
      handler: async (params) => {
        const monitorId = params.monitor_id as string;
        const removed = removeMonitor(monitorId);

        if (!removed) {
          return { error: `Monitor ${monitorId} not found` };
        }

        return {
          monitor_id: monitorId,
          removed: true,
          message: "Monitor removed successfully.",
        };
      },
    },
    {
      name: "monitor_list",
      description: "List all monitors with their current status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const monitors = getAllMonitors();
        const list = Object.values(monitors).map((m) => ({
          id: m.id,
          url: m.url,
          label: m.label,
          selector: m.selector,
          interval_seconds: m.interval_seconds,
          status: m.status,
          check_count: m.check_count,
          change_count: m.change_count,
          last_checked: m.last_checked
            ? new Date(m.last_checked).toISOString()
            : null,
          last_changed: m.last_changed
            ? new Date(m.last_changed).toISOString()
            : null,
          last_error: m.last_error,
        }));

        return {
          count: list.length,
          monitors: list,
        };
      },
    },
    {
      name: "monitor_check",
      description:
        "Manually trigger an immediate check for a specific monitor. Returns the diff result if content changed.",
      inputSchema: {
        type: "object",
        properties: {
          monitor_id: {
            type: "string",
            description: "The monitor ID to check.",
          },
        },
        required: ["monitor_id"],
      },
      handler: async (params) => {
        const monitorId = params.monitor_id as string;
        const monitor = getMonitor(monitorId);

        if (!monitor) {
          return { error: `Monitor ${monitorId} not found` };
        }

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
            if (monitor.history.length > 50) {
              monitor.history = monitor.history.slice(-50);
            }
          }

          monitor.last_hash = result.new_hash;
          // Re-fetch content for storage (we already have it from checkMonitor but it doesn't return it)
          // Instead, store the snippet as a lightweight alternative
          if (result.changed || !monitor.last_content) {
            // Fetch again to store content
            try {
              const response = await fetch(monitor.url, {
                headers: { "User-Agent": "web-monitor-mcp/1.0" },
                signal: AbortSignal.timeout(30000),
              });
              if (response.ok) {
                const html = await response.text();
                const { extractContent } = await import("../poller.js");
                monitor.last_content = extractContent(html, monitor.selector);
              }
            } catch {
              // Non-critical: content storage failed
            }
          }

          updateMonitor(monitor);

          return {
            monitor_id: monitorId,
            url: monitor.url,
            changed: result.changed,
            old_hash: result.old_hash,
            new_hash: result.new_hash,
            diff: result.diff,
            snippet: result.snippet,
            check_count: monitor.check_count,
            change_count: monitor.change_count,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          monitor.last_error = message;
          monitor.status = "error";
          monitor.last_checked = Date.now();
          updateMonitor(monitor);

          return {
            monitor_id: monitorId,
            error: message,
          };
        }
      },
    },
    {
      name: "monitor_status",
      description:
        "Get detailed status for one or all monitors, including recent history.",
      inputSchema: {
        type: "object",
        properties: {
          monitor_id: {
            type: "string",
            description:
              "Optional monitor ID. If omitted, returns status for all monitors.",
          },
        },
      },
      handler: async (params) => {
        const monitorId = params.monitor_id as string | undefined;

        if (monitorId) {
          const monitor = getMonitor(monitorId);
          if (!monitor) {
            return { error: `Monitor ${monitorId} not found` };
          }

          return {
            id: monitor.id,
            url: monitor.url,
            label: monitor.label,
            selector: monitor.selector,
            interval_seconds: monitor.interval_seconds,
            status: monitor.status,
            created: new Date(monitor.created).toISOString(),
            last_checked: monitor.last_checked
              ? new Date(monitor.last_checked).toISOString()
              : null,
            last_changed: monitor.last_changed
              ? new Date(monitor.last_changed).toISOString()
              : null,
            last_hash: monitor.last_hash,
            check_count: monitor.check_count,
            change_count: monitor.change_count,
            last_error: monitor.last_error,
            recent_history: monitor.history.slice(-10).map((h) => ({
              timestamp: new Date(h.timestamp).toISOString(),
              hash: h.hash,
              snippet: h.snippet,
              diff_length: h.diff.length,
            })),
          };
        }

        // Return status for all monitors
        const monitors = getAllMonitors();
        const statuses = Object.values(monitors).map((m) => ({
          id: m.id,
          url: m.url,
          label: m.label,
          status: m.status,
          check_count: m.check_count,
          change_count: m.change_count,
          last_checked: m.last_checked
            ? new Date(m.last_checked).toISOString()
            : null,
          last_changed: m.last_changed
            ? new Date(m.last_changed).toISOString()
            : null,
          last_error: m.last_error,
          history_count: m.history.length,
        }));

        return {
          count: statuses.length,
          monitors: statuses,
        };
      },
    },
  ];
}
