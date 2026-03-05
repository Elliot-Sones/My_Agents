import { execFileSync } from "child_process";

function runAppleScript(script: string): string {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 10000,
  }).trim();
}

export function clipboardRead(): string {
  return execFileSync("pbpaste", [], {
    encoding: "utf8",
    timeout: 5000,
  });
}

export function clipboardWrite(text: string): string {
  execFileSync("pbcopy", [], {
    input: text,
    encoding: "utf8",
    timeout: 5000,
  });
  return "Copied to clipboard";
}

export function sendNotification(
  title: string,
  message: string,
  subtitle?: string
): string {
  const subtitlePart = subtitle
    ? ` subtitle ${JSON.stringify(subtitle)}`
    : "";
  runAppleScript(
    `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}${subtitlePart}`
  );
  return "Notification sent";
}

export function runAppleScriptRaw(script: string): string {
  return runAppleScript(script);
}

export function runJXARaw(script: string): string {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024,
  }).trim();
}
