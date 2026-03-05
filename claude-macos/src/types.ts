export interface WindowInfo {
  app: string;
  title: string;
  index: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  fullscreen: boolean;
}

export interface AppInfo {
  name: string;
  bundleId: string;
  pid: number;
  frontmost: boolean;
  visible: boolean;
}

export interface A11yNode {
  role: string;
  title: string;
  value: string;
  description: string;
  enabled: boolean;
  focused: boolean;
  position: { x: number; y: number } | null;
  size: { width: number; height: number } | null;
  children: A11yNode[];
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
