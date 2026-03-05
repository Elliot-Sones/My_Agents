import type { ToolDef } from "../types.js";
import {
  moveMouse,
  mouseClick,
  mouseDrag,
  typeText,
  keyPress,
  keyCombo,
} from "../input.js";

export function inputTools(): ToolDef[] {
  return [
    {
      name: "mouse_move",
      description: "Move the mouse cursor to an absolute screen position.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" },
        },
        required: ["x", "y"],
      },
      handler: async (params) => {
        moveMouse(params.x as number, params.y as number);
        return { moved: true, x: params.x, y: params.y };
      },
    },
    {
      name: "mouse_click",
      description:
        "Click the mouse at the current position or at specified coordinates. Supports left, right, middle buttons and double-click.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (optional, clicks at current position if omitted)" },
          y: { type: "number", description: "Y coordinate (optional)" },
          button: {
            type: "string",
            enum: ["left", "right", "middle"],
            description: "Mouse button (default: left)",
          },
          double: { type: "boolean", description: "Double-click (default: false)" },
        },
      },
      handler: async (params) => {
        mouseClick(
          params.x as number | undefined,
          params.y as number | undefined,
          (params.button as "left" | "right" | "middle") || "left",
          (params.double as boolean) || false
        );
        return { clicked: true, x: params.x, y: params.y, button: params.button || "left" };
      },
    },
    {
      name: "mouse_drag",
      description: "Drag the mouse from one position to another.",
      inputSchema: {
        type: "object",
        properties: {
          from_x: { type: "number", description: "Start X coordinate" },
          from_y: { type: "number", description: "Start Y coordinate" },
          to_x: { type: "number", description: "End X coordinate" },
          to_y: { type: "number", description: "End Y coordinate" },
        },
        required: ["from_x", "from_y", "to_x", "to_y"],
      },
      handler: async (params) => {
        mouseDrag(
          params.from_x as number,
          params.from_y as number,
          params.to_x as number,
          params.to_y as number
        );
        return { dragged: true };
      },
    },
    {
      name: "type_text",
      description: "Type a string of text using keyboard simulation.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type" },
        },
        required: ["text"],
      },
      handler: async (params) => {
        typeText(params.text as string);
        return { typed: true, length: (params.text as string).length };
      },
    },
    {
      name: "key_press",
      description:
        "Press a single key. Supports special keys: return, tab, space, delete, escape, forwarddelete, home, end, pageup, pagedown, leftarrow, rightarrow, uparrow, downarrow, f1-f12, or any single character.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to press" },
        },
        required: ["key"],
      },
      handler: async (params) => {
        keyPress(params.key as string);
        return { pressed: true, key: params.key };
      },
    },
    {
      name: "key_combo",
      description:
        "Press a key combination with modifiers. Example: key='c', modifiers=['cmd'] for Cmd+C.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to press" },
          modifiers: {
            type: "array",
            items: {
              type: "string",
              enum: ["cmd", "shift", "alt", "ctrl", "command", "option", "control"],
            },
            description: "Modifier keys to hold",
          },
        },
        required: ["key", "modifiers"],
      },
      handler: async (params) => {
        keyCombo(params.key as string, params.modifiers as string[]);
        return { pressed: true, key: params.key, modifiers: params.modifiers };
      },
    },
  ];
}
