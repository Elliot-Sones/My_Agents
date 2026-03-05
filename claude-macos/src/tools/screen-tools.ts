import type { ToolDef } from "../types.js";
import { takeScreenshot, getScreenSize } from "../screen.js";

export function screenTools(): ToolDef[] {
  return [
    {
      name: "screenshot",
      description:
        "Take a screenshot of the entire screen or a specific region. Returns a base64-encoded PNG image.",
      inputSchema: {
        type: "object",
        properties: {
          region: {
            type: "object",
            description: "Optional region to capture",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
        },
      },
      handler: async (params) => {
        const region = params.region as
          | { x: number; y: number; width: number; height: number }
          | undefined;
        const result = takeScreenshot(region);
        return {
          width: result.width,
          height: result.height,
          base64_png: result.base64,
        };
      },
    },
    {
      name: "screen_size",
      description: "Get the main screen resolution in pixels.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        return getScreenSize();
      },
    },
  ];
}
