import type { ToolDef } from "../types.js";
import {
  listApps,
  listWindows,
  launchApp,
  quitApp,
  focusWindow,
  resizeWindow,
} from "../apps.js";

export function windowTools(): ToolDef[] {
  return [
    {
      name: "app_launch",
      description: "Launch a macOS application by name.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: { type: "string", description: "Application name (e.g. 'Safari', 'Terminal')" },
        },
        required: ["app_name"],
      },
      handler: async (params) => {
        const result = launchApp(params.app_name as string);
        return { result };
      },
    },
    {
      name: "app_quit",
      description: "Quit a running application.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: { type: "string", description: "Application name" },
        },
        required: ["app_name"],
      },
      handler: async (params) => {
        const result = quitApp(params.app_name as string);
        return { result };
      },
    },
    {
      name: "app_list",
      description:
        "List all running foreground applications with their names, bundle IDs, PIDs, and visibility.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const apps = listApps();
        return { count: apps.length, apps };
      },
    },
    {
      name: "window_list",
      description:
        "List all open windows, optionally filtered by application name. Returns position, size, and title.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Filter by application name (optional)",
          },
        },
      },
      handler: async (params) => {
        const windows = listWindows(params.app_name as string | undefined);
        return { count: windows.length, windows };
      },
    },
    {
      name: "window_focus",
      description:
        "Bring an application window to the front. Optionally specify a window title.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: { type: "string", description: "Application name" },
          window_title: {
            type: "string",
            description: "Specific window title to focus (optional)",
          },
        },
        required: ["app_name"],
      },
      handler: async (params) => {
        const result = focusWindow(
          params.app_name as string,
          params.window_title as string | undefined
        );
        return { result };
      },
    },
    {
      name: "window_resize",
      description: "Move and resize an application's front window.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: { type: "string", description: "Application name" },
          x: { type: "number", description: "Window X position" },
          y: { type: "number", description: "Window Y position" },
          width: { type: "number", description: "Window width" },
          height: { type: "number", description: "Window height" },
        },
        required: ["app_name", "x", "y", "width", "height"],
      },
      handler: async (params) => {
        const result = resizeWindow(
          params.app_name as string,
          params.x as number,
          params.y as number,
          params.width as number,
          params.height as number
        );
        return { result };
      },
    },
  ];
}
