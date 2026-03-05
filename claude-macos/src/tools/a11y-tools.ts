import type { ToolDef } from "../types.js";
import {
  getA11yTree,
  findA11yElements,
  clickA11yElement,
  setA11yValue,
} from "../accessibility.js";

export function a11yTools(): ToolDef[] {
  return [
    {
      name: "a11y_snapshot",
      description:
        "Get the accessibility tree of a running application. Returns a JSON tree of UI elements with roles, titles, values, positions, and children. Use this to understand what is on screen.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Name of the application process (e.g. 'Safari', 'Finder', 'Code')",
          },
          max_depth: {
            type: "number",
            description: "Maximum tree depth to traverse (default: 5)",
          },
        },
        required: ["app_name"],
      },
      handler: async (params) => {
        const tree = getA11yTree(
          params.app_name as string,
          (params.max_depth as number) || 5
        );
        return tree;
      },
    },
    {
      name: "a11y_click",
      description:
        "Click an accessibility element by its role and/or title within an application. The app is brought to front before clicking.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Name of the application process",
          },
          role: {
            type: "string",
            description: "Accessibility role (e.g. 'AXButton', 'AXTextField', 'AXMenuItem')",
          },
          title: {
            type: "string",
            description: "Title or description of the element to click",
          },
          index: {
            type: "number",
            description: "0-based index if multiple elements match (default: 0)",
          },
        },
        required: ["app_name"],
      },
      handler: async (params) => {
        const result = clickA11yElement(
          params.app_name as string,
          params.role as string | undefined,
          params.title as string | undefined,
          params.index as number | undefined
        );
        return { result };
      },
    },
    {
      name: "a11y_set_value",
      description:
        "Set the value of a UI element (text field, checkbox, etc.) identified by role and optionally title.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Name of the application process",
          },
          role: {
            type: "string",
            description: "Accessibility role of the element",
          },
          title: {
            type: "string",
            description: "Title of the element (optional filter)",
          },
          value: {
            type: "string",
            description: "Value to set",
          },
        },
        required: ["app_name", "role", "value"],
      },
      handler: async (params) => {
        const result = setA11yValue(
          params.app_name as string,
          params.role as string,
          params.title as string | undefined,
          params.value as string
        );
        return { result };
      },
    },
    {
      name: "a11y_find",
      description:
        "Search the accessibility tree for elements matching a text query. Searches titles, values, descriptions, and roles.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Name of the application process",
          },
          query: {
            type: "string",
            description: "Search text to match against element properties",
          },
        },
        required: ["app_name", "query"],
      },
      handler: async (params) => {
        const elements = findA11yElements(
          params.app_name as string,
          params.query as string
        );
        return { count: elements.length, elements };
      },
    },
  ];
}
