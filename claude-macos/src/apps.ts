import { execFileSync } from "child_process";
import type { AppInfo, WindowInfo } from "./types.js";

function runJXA(script: string): string {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 5 * 1024 * 1024,
  }).trim();
}

function runAppleScript(script: string): string {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 15000,
  }).trim();
}

export function listApps(): AppInfo[] {
  const result = runJXA(`
    var se = Application('System Events');
    var procs = se.processes.whose({backgroundOnly: false})();
    var apps = [];
    for (var i = 0; i < procs.length; i++) {
      var p = procs[i];
      try {
        apps.push({
          name: p.name(),
          bundleId: p.bundleIdentifier() || '',
          pid: p.unixId(),
          frontmost: p.frontmost(),
          visible: p.visible()
        });
      } catch(e) {}
    }
    JSON.stringify(apps);
  `);

  try {
    return JSON.parse(result) as AppInfo[];
  } catch {
    return [];
  }
}

export function listWindows(appName?: string): WindowInfo[] {
  const filter = appName
    ? `var procs = [se.processes.byName(${JSON.stringify(appName)})];`
    : `var procs = se.processes.whose({backgroundOnly: false})();`;

  const result = runJXA(`
    var se = Application('System Events');
    ${filter}
    var windows = [];
    for (var i = 0; i < procs.length; i++) {
      var p = procs[i];
      var pName;
      try { pName = p.name(); } catch(e) { continue; }
      try {
        var wins = p.windows();
        for (var j = 0; j < wins.length; j++) {
          var w = wins[j];
          try {
            var pos = w.position();
            var sz = w.size();
            windows.push({
              app: pName,
              title: w.title() || '',
              index: j,
              position: {x: pos[0], y: pos[1]},
              size: {width: sz[0], height: sz[1]},
              minimized: w.minimized ? w.minimized() : false,
              fullscreen: false
            });
          } catch(e2) {}
        }
      } catch(e) {}
    }
    JSON.stringify(windows);
  `);

  try {
    return JSON.parse(result) as WindowInfo[];
  } catch {
    return [];
  }
}

export function launchApp(appName: string): string {
  runAppleScript(`tell application "${appName.replace(/"/g, '\\"')}" to activate`);
  return `Launched ${appName}`;
}

export function quitApp(appName: string): string {
  runAppleScript(`tell application "${appName.replace(/"/g, '\\"')}" to quit`);
  return `Quit ${appName}`;
}

export function focusWindow(appName: string, windowTitle?: string): string {
  if (windowTitle) {
    const escaped = windowTitle.replace(/"/g, '\\"');
    runAppleScript(`
tell application "System Events"
  tell process "${appName.replace(/"/g, '\\"')}"
    set frontmost to true
    try
      perform action "AXRaise" of (first window whose title is "${escaped}")
    end try
  end tell
end tell`);
    return `Focused window "${windowTitle}" of ${appName}`;
  } else {
    runAppleScript(`tell application "${appName.replace(/"/g, '\\"')}" to activate`);
    return `Focused ${appName}`;
  }
}

export function resizeWindow(
  appName: string,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  runAppleScript(`
tell application "System Events"
  tell process "${appName.replace(/"/g, '\\"')}"
    set frontmost to true
    tell window 1
      set position to {${x}, ${y}}
      set size to {${width}, ${height}}
    end tell
  end tell
end tell`);
  return `Resized ${appName} window to ${width}x${height} at (${x},${y})`;
}
