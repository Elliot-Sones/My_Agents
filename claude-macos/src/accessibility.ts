import { execFileSync } from "child_process";
import type { A11yNode } from "./types.js";

function runAppleScript(script: string): string {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

function runJXA(script: string): string {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

export function getA11yTree(appName: string, maxDepth: number = 5): A11yNode {
  const script = `
    ObjC.import('Cocoa');

    function getNode(el, depth, maxDepth) {
      if (depth > maxDepth) return null;
      var node = {
        role: '',
        title: '',
        value: '',
        description: '',
        enabled: true,
        focused: false,
        position: null,
        size: null,
        children: []
      };
      try { node.role = String(el.role()); } catch(e) {}
      try { node.title = String(el.title() || ''); } catch(e) {}
      try {
        var v = el.value();
        node.value = v !== null && v !== undefined ? String(v) : '';
      } catch(e) {}
      try { node.description = String(el.description() || ''); } catch(e) {}
      try { node.enabled = el.enabled(); } catch(e) {}
      try { node.focused = el.focused(); } catch(e) {}
      try {
        var pos = el.position();
        if (pos) node.position = {x: pos[0], y: pos[1]};
      } catch(e) {}
      try {
        var sz = el.size();
        if (sz) node.size = {width: sz[0], height: sz[1]};
      } catch(e) {}
      try {
        var kids = el.uiElements();
        if (kids && kids.length > 0) {
          for (var i = 0; i < kids.length && i < 100; i++) {
            var child = getNode(kids[i], depth + 1, maxDepth);
            if (child) node.children.push(child);
          }
        }
      } catch(e) {}
      return node;
    }

    var app = Application('System Events');
    var proc = app.processes.byName(${JSON.stringify(appName)});
    var root = {
      role: 'AXApplication',
      title: ${JSON.stringify(appName)},
      value: '',
      description: '',
      enabled: true,
      focused: false,
      position: null,
      size: null,
      children: []
    };
    try { root.focused = proc.frontmost(); } catch(e) {}
    try {
      var wins = proc.windows();
      for (var w = 0; w < wins.length && w < 20; w++) {
        var child = getNode(wins[w], 1, ${maxDepth});
        if (child) root.children.push(child);
      }
    } catch(e) {}
    JSON.stringify(root);
  `;

  const result = runJXA(script);
  try {
    return JSON.parse(result) as A11yNode;
  } catch {
    return {
      role: "AXApplication",
      title: appName,
      value: "",
      description: result,
      enabled: true,
      focused: false,
      position: null,
      size: null,
      children: [],
    };
  }
}

export function findA11yElements(
  appName: string,
  query: string
): A11yNode[] {
  const tree = getA11yTree(appName, 6);
  const results: A11yNode[] = [];
  const lowerQuery = query.toLowerCase();

  function search(node: A11yNode): void {
    const match =
      node.title.toLowerCase().includes(lowerQuery) ||
      node.value.toLowerCase().includes(lowerQuery) ||
      node.description.toLowerCase().includes(lowerQuery) ||
      node.role.toLowerCase().includes(lowerQuery);
    if (match) {
      results.push(node);
    }
    for (const child of node.children) {
      search(child);
    }
  }

  search(tree);
  return results;
}

export function clickA11yElement(
  appName: string,
  role?: string,
  title?: string,
  index?: number
): string {
  const roleFilter = role
    ? `whose role is ${JSON.stringify(role)}`
    : "";

  // Build a targeted AppleScript to find and click
  if (title) {
    const escaped = title.replace(/"/g, '\\"');
    const script = `
tell application "System Events"
  tell process "${appName}"
    set frontmost to true
    set matchedElements to {}
    try
      set matchedElements to every UI element ${roleFilter} whose title is "${escaped}"
    end try
    if (count of matchedElements) is 0 then
      try
        set matchedElements to every UI element ${roleFilter} whose description is "${escaped}"
      end try
    end if
    if (count of matchedElements) > 0 then
      set idx to ${index !== undefined ? index + 1 : 1}
      if idx > (count of matchedElements) then set idx to 1
      click item idx of matchedElements
      return "Clicked element: " & "${escaped}"
    else
      return "No element found matching title: ${escaped}"
    end if
  end tell
end tell`;
    return runAppleScript(script);
  } else if (role) {
    const script = `
tell application "System Events"
  tell process "${appName}"
    set frontmost to true
    set matchedElements to every UI element whose role is ${JSON.stringify(role)}
    if (count of matchedElements) > 0 then
      set idx to ${index !== undefined ? index + 1 : 1}
      if idx > (count of matchedElements) then set idx to 1
      click item idx of matchedElements
      return "Clicked element with role: ${role}"
    else
      return "No element found with role: ${role}"
    end if
  end tell
end tell`;
    return runAppleScript(script);
  }

  return "Must specify at least role or title";
}

export function setA11yValue(
  appName: string,
  role: string,
  title: string | undefined,
  value: string
): string {
  const escapedValue = value.replace(/"/g, '\\"');
  const titleFilter = title
    ? `whose title is "${title.replace(/"/g, '\\"')}"`
    : "";

  const script = `
tell application "System Events"
  tell process "${appName}"
    set frontmost to true
    set matchedElements to every UI element whose role is ${JSON.stringify(role)} ${titleFilter}
    if (count of matchedElements) > 0 then
      set value of item 1 of matchedElements to "${escapedValue}"
      return "Set value successfully"
    else
      return "No matching element found"
    end if
  end tell
end tell`;
  return runAppleScript(script);
}
