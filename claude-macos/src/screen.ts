import { execFileSync } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function runJXA(script: string): string {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    timeout: 10000,
  }).trim();
}

export function takeScreenshot(region?: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { base64: string; width: number; height: number } {
  const tmpPath = join(tmpdir(), `claude-macos-screenshot-${Date.now()}.png`);

  try {
    const args: string[] = ["-x", "-t", "png"];

    if (region) {
      args.push(
        "-R",
        `${region.x},${region.y},${region.width},${region.height}`
      );
    }

    args.push(tmpPath);
    execFileSync("screencapture", args, { timeout: 10000 });

    const buffer = readFileSync(tmpPath);
    const base64 = buffer.toString("base64");

    // Get dimensions via sips
    const sipsOutput = execFileSync(
      "sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", tmpPath],
      { encoding: "utf8", timeout: 5000 }
    );

    let width = 0;
    let height = 0;
    const widthMatch = sipsOutput.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = sipsOutput.match(/pixelHeight:\s*(\d+)/);
    if (widthMatch) width = parseInt(widthMatch[1], 10);
    if (heightMatch) height = parseInt(heightMatch[1], 10);

    return { base64, width, height };
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}

export function getScreenSize(): { width: number; height: number } {
  const result = runJXA(`
    ObjC.import('AppKit');
    var screen = $.NSScreen.mainScreen;
    var frame = screen.frame;
    JSON.stringify({width: frame.size.width, height: frame.size.height});
  `);

  try {
    return JSON.parse(result);
  } catch {
    // Fallback via system_profiler
    const output = execFileSync(
      "system_profiler",
      ["SPDisplaysDataType"],
      { encoding: "utf8", timeout: 10000 }
    );
    const match = output.match(/Resolution:\s*(\d+)\s*x\s*(\d+)/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
    return { width: 1920, height: 1080 };
  }
}
