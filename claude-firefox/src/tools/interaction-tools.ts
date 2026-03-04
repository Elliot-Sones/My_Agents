import type { UnixSocketBridge } from "../unix-socket-bridge.js";
import type { ToolDef } from "./index.js";

export function interactionTools(bridge: UnixSocketBridge): ToolDef[] {
  return [
    {
      name: "element_click",
      description:
        "Click an element by its ref ID. Automatically returns the updated page state after the click.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "The ref_id of the element to click." },
        },
        required: ["tabId", "ref"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_click", params);
      },
    },
    {
      name: "click_and_wait",
      description:
        "Click an element and wait for navigation or a condition, then return the new page state. Useful for form submissions and link clicks that trigger page loads.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "The ref_id of the element to click." },
          waitFor: {
            type: "string",
            description: "URL pattern to wait for, or a timeout in ms (e.g. '2000'). If a URL pattern is given, waits until the page URL matches.",
          },
        },
        required: ["tabId", "ref"],
      },
      handler: async (params) => {
        return bridge.sendRequest("click_and_wait", params);
      },
    },
    {
      name: "element_type",
      description:
        "Type text into an element keystroke by keystroke. Triggers input events for each character. Use for inputs that rely on keyboard events.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "The ref_id of the input element." },
          text: { type: "string", description: "Text to type." },
        },
        required: ["tabId", "ref", "text"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_type", params);
      },
    },
    {
      name: "element_fill",
      description:
        "Set the value of an input element directly. Faster than element_type but may not trigger all keyboard events.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "The ref_id of the input element." },
          value: { type: "string", description: "Value to set." },
        },
        required: ["tabId", "ref", "value"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_fill", params);
      },
    },
    {
      name: "form_fill",
      description:
        "Fill multiple form fields at once. Each field is specified by its ref ID and the value to set.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ref: { type: "string", description: "The ref_id of the form field." },
                value: { type: "string", description: "Value to fill." },
              },
              required: ["ref", "value"],
            },
            description: "Array of fields to fill.",
          },
        },
        required: ["tabId", "fields"],
      },
      handler: async (params) => {
        return bridge.sendRequest("form_fill", params);
      },
    },
    {
      name: "form_fill_and_submit",
      description:
        "Fill multiple form fields and then click a submit button. Returns the page state after submission.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ref: { type: "string", description: "The ref_id of the form field." },
                value: { type: "string", description: "Value to fill." },
              },
              required: ["ref", "value"],
            },
            description: "Array of fields to fill before submitting.",
          },
          submitRef: { type: "string", description: "The ref_id of the submit button to click." },
        },
        required: ["tabId", "fields", "submitRef"],
      },
      handler: async (params) => {
        return bridge.sendRequest("form_fill_and_submit", params);
      },
    },
    {
      name: "element_hover",
      description: "Move the mouse cursor to the specified coordinates or element without clicking. Useful for revealing tooltips, dropdown menus, or triggering hover states.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "Element reference ID from read_page or find tools." },
        },
        required: ["tabId", "ref"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_hover", params);
      },
    },
    {
      name: "element_double_click",
      description: "Double-click the left mouse button on an element.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "Element reference ID from read_page or find tools." },
        },
        required: ["tabId", "ref"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_double_click", params);
      },
    },
    {
      name: "element_right_click",
      description: "Right-click an element to open context menus.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          ref: { type: "string", description: "Element reference ID from read_page or find tools." },
        },
        required: ["tabId", "ref"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_right_click", params);
      },
    },
    {
      name: "key_press",
      description: "Press a specific keyboard key or chord. Supports: Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, F1-F12, Space, and modifier combos like 'ctrl+a', 'shift+Tab'.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          keys: {
            description: "Key or array of keys to press (e.g. 'Enter', ['ctrl+a', 'Backspace']).",
          },
          ref: { type: "string", description: "Optional element ref to focus before pressing key. Defaults to currently focused element." },
        },
        required: ["tabId", "keys"],
      },
      handler: async (params) => {
        return bridge.sendRequest("key_press", params);
      },
    },
    {
      name: "find",
      description: "Find elements on the page using natural language. Can search for elements by their purpose (e.g., 'search bar', 'login button') or by text content. Returns up to 20 matching elements with references that can be used with other tools.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          query: { type: "string", description: "Natural language description of what to find (e.g., 'search bar', 'add to cart button', 'product title containing organic')." },
          maxResults: { type: "number", description: "Maximum number of results to return (default: 20)." },
        },
        required: ["tabId", "query"],
      },
      handler: async (params) => {
        return bridge.sendRequest("find", params);
      },
    },
    {
      name: "element_drag",
      description:
        "Drag from one element to another element or to explicit coordinates. Synthesizes the full pointer event sequence (pointerdown → pointermove × steps → pointerup). Use bounding box @{x,y,w,h} values from page_snapshot to determine coordinates.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          fromRef: { type: "string", description: "Ref ID of the element to drag from." },
          toRef: { type: "string", description: "Ref ID of the element to drag to. Use either toRef or toX/toY." },
          toX: { type: "number", description: "Target X coordinate (alternative to toRef)." },
          toY: { type: "number", description: "Target Y coordinate (alternative to toRef)." },
          steps: { type: "number", description: "Number of intermediate pointermove events (default: 10). More steps = smoother drag." },
        },
        required: ["tabId", "fromRef"],
      },
      handler: async (params) => {
        return bridge.sendRequest("element_drag", params);
      },
    },
  ];
}
