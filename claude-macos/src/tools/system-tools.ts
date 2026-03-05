import type { ToolDef } from "../types.js";
import {
  clipboardRead,
  clipboardWrite,
  sendNotification,
  runAppleScriptRaw,
  runJXARaw,
} from "../clipboard.js";

export function systemTools(): ToolDef[] {
  return [
    {
      name: "clipboard_read",
      description: "Read the current contents of the macOS clipboard.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const content = clipboardRead();
        return { content };
      },
    },
    {
      name: "clipboard_write",
      description: "Write text to the macOS clipboard.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to copy to clipboard" },
        },
        required: ["text"],
      },
      handler: async (params) => {
        const result = clipboardWrite(params.text as string);
        return { result };
      },
    },
    {
      name: "notification_send",
      description: "Send a macOS notification with a title, message, and optional subtitle.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Notification title" },
          message: { type: "string", description: "Notification body text" },
          subtitle: { type: "string", description: "Optional subtitle" },
        },
        required: ["title", "message"],
      },
      handler: async (params) => {
        const result = sendNotification(
          params.title as string,
          params.message as string,
          params.subtitle as string | undefined
        );
        return { result };
      },
    },
    {
      name: "run_applescript",
      description:
        "Execute an arbitrary AppleScript and return its output. Use this for any macOS automation not covered by other tools.",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "AppleScript source code" },
        },
        required: ["script"],
      },
      handler: async (params) => {
        const output = runAppleScriptRaw(params.script as string);
        return { output };
      },
    },
    {
      name: "run_jxa",
      description:
        "Execute JavaScript for Automation (JXA) and return its output. JXA provides a JavaScript bridge to macOS APIs.",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "JXA source code" },
        },
        required: ["script"],
      },
      handler: async (params) => {
        const output = runJXARaw(params.script as string);
        return { output };
      },
    },
  ];
}
