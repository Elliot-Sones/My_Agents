import { execFileSync } from "child_process";

function runJXA(script: string): string {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    timeout: 10000,
  }).trim();
}

function runAppleScript(script: string): string {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 10000,
  }).trim();
}

export function moveMouse(x: number, y: number): void {
  runJXA(`
    ObjC.import('CoreGraphics');
    var point = {x: ${x}, y: ${y}};
    var event = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, point, 0);
    $.CGEventPost($.kCGHIDEventTap, event);
    $.CFRelease(event);
  `);
}

export function mouseClick(
  x: number | undefined,
  y: number | undefined,
  button: "left" | "right" | "middle" = "left",
  double: boolean = false
): void {
  if (x !== undefined && y !== undefined) {
    moveMouse(x, y);
    // Small delay so the move registers before click
    execFileSync("sleep", ["0.05"]);
  }

  const buttonCode = button === "right" ? 1 : button === "middle" ? 2 : 0;
  const downEvent = button === "right" ? "$.kCGEventRightMouseDown" : "$.kCGEventLeftMouseDown";
  const upEvent = button === "right" ? "$.kCGEventRightMouseUp" : "$.kCGEventLeftMouseUp";

  const clickCount = double ? 2 : 1;

  runJXA(`
    ObjC.import('CoreGraphics');
    var loc = $.CGEventGetLocation($.CGEventCreate(null));
    for (var i = 0; i < ${clickCount}; i++) {
      var down = $.CGEventCreateMouseEvent(null, ${downEvent}, loc, ${buttonCode});
      $.CGEventSetIntegerValueField(down, $.kCGMouseEventClickState, ${clickCount});
      $.CGEventPost($.kCGHIDEventTap, down);
      $.CFRelease(down);
      var up = $.CGEventCreateMouseEvent(null, ${upEvent}, loc, ${buttonCode});
      $.CGEventSetIntegerValueField(up, $.kCGMouseEventClickState, ${clickCount});
      $.CGEventPost($.kCGHIDEventTap, up);
      $.CFRelease(up);
    }
  `);
}

export function mouseDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  runJXA(`
    ObjC.import('CoreGraphics');
    var from = {x: ${fromX}, y: ${fromY}};
    var to = {x: ${toX}, y: ${toY}};

    var move = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, from, 0);
    $.CGEventPost($.kCGHIDEventTap, move);
    $.CFRelease(move);

    var down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, from, 0);
    $.CGEventPost($.kCGHIDEventTap, down);
    $.CFRelease(down);

    var steps = 20;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var cx = from.x + (to.x - from.x) * t;
      var cy = from.y + (to.y - from.y) * t;
      var drag = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDragged, {x: cx, y: cy}, 0);
      $.CGEventPost($.kCGHIDEventTap, drag);
      $.CFRelease(drag);
    }

    var up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, to, 0);
    $.CGEventPost($.kCGHIDEventTap, up);
    $.CFRelease(up);
  `);
}

export function typeText(text: string): void {
  // Use System Events keystroke for typing text
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  runAppleScript(`tell application "System Events" to keystroke "${escaped}"`);
}

const KEY_CODE_MAP: Record<string, number> = {
  return: 36,
  enter: 76,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
  forwarddelete: 117,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  leftarrow: 123,
  rightarrow: 124,
  downarrow: 125,
  uparrow: 126,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

export function keyPress(key: string): void {
  const lower = key.toLowerCase();
  const code = KEY_CODE_MAP[lower];
  if (code !== undefined) {
    runAppleScript(
      `tell application "System Events" to key code ${code}`
    );
  } else if (key.length === 1) {
    runAppleScript(
      `tell application "System Events" to keystroke "${key}"`
    );
  } else {
    throw new Error(`Unknown key: ${key}. Use a single character or one of: ${Object.keys(KEY_CODE_MAP).join(", ")}`);
  }
}

export function keyCombo(
  key: string,
  modifiers: string[]
): void {
  const modMap: Record<string, string> = {
    cmd: "command down",
    command: "command down",
    shift: "shift down",
    alt: "option down",
    option: "option down",
    ctrl: "control down",
    control: "control down",
  };

  const modList = modifiers
    .map((m) => modMap[m.toLowerCase()])
    .filter(Boolean);

  if (modList.length === 0) {
    keyPress(key);
    return;
  }

  const modString = modList.join(", ");
  const lower = key.toLowerCase();
  const code = KEY_CODE_MAP[lower];

  if (code !== undefined) {
    runAppleScript(
      `tell application "System Events" to key code ${code} using {${modString}}`
    );
  } else if (key.length === 1) {
    runAppleScript(
      `tell application "System Events" to keystroke "${key}" using {${modString}}`
    );
  } else {
    throw new Error(`Unknown key: ${key}`);
  }
}
