export interface Monitor {
  id: string;
  url: string;
  selector: string | null;
  interval_seconds: number;
  label: string;
  created: number;
  last_checked: number | null;
  last_changed: number | null;
  last_hash: string | null;
  last_content: string | null;
  check_count: number;
  change_count: number;
  status: "active" | "paused" | "error";
  last_error: string | null;
  history: HistoryEntry[];
}

export interface HistoryEntry {
  timestamp: number;
  hash: string;
  diff: string;
  snippet: string;
}

export interface MonitorStore {
  monitors: Record<string, Monitor>;
}

export interface DiffResult {
  changed: boolean;
  old_hash: string | null;
  new_hash: string;
  diff: string | null;
  snippet: string;
  content: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}
