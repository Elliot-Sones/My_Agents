// Message types shared between MCP server and Firefox extension

export interface WSMessage {
  id: string;
  type: "request" | "response" | "auth" | "ping" | "pong";
  action?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface AuthMessage {
  type: "auth";
  secret: string;
}

export interface ToolRequest {
  id: string;
  type: "request";
  action: string;
  params: Record<string, unknown>;
}

export interface ToolResponse {
  id: string;
  type: "response";
  result?: unknown;
  error?: string;
}

// Accessibility tree node
export interface AccessibilityNode {
  ref: string;
  role: string;
  name?: string;
  value?: string;
  description?: string;
  state?: string[];
  children?: AccessibilityNode[];
}

// Page snapshot result
export interface PageSnapshot {
  url: string;
  title: string;
  tree: string;
  cached?: boolean;
  fingerprint?: string;
}

// Click/interaction result
export interface ActionResult {
  success: boolean;
  verification?: {
    urlChanged: boolean;
    newUrl?: string;
    newTitle?: string;
    domChanged: boolean;
  };
  snapshot?: string;
  alerts?: AlertInfo[];
  error?: string;
}

export interface AlertInfo {
  type: "popup" | "login_wall" | "error_page" | "loading";
  message: string;
  dismiss_ref?: string;
}

// Form fill field
export interface FormField {
  ref: string;
  value: string;
}

// Memory types
export interface Memory {
  value: string;
  confidence: number;
  version: number;
  created: number;
  last_used: number;
  history: MemoryHistoryEntry[];
}

export interface MemoryHistoryEntry {
  old: string;
  changed: number;
}

export type MemoryCategory = "selector" | "pattern" | "workflow";

export interface MemoryKey {
  domain: string;
  category: MemoryCategory;
  identifier: string;
}

export function parseMemoryKey(key: string): MemoryKey {
  const [domain, category, ...rest] = key.split("::");
  return {
    domain,
    category: category as MemoryCategory,
    identifier: rest.join("::"),
  };
}

export function formatMemoryKey(key: MemoryKey): string {
  return `${key.domain}::${key.category}::${key.identifier}`;
}

// Tab info
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  isClaude: boolean;
  active: boolean;
}

// Network request info
export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  type: string;
  timestamp: number;
}
