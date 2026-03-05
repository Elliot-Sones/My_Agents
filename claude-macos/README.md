# claude-macos

MCP server for macOS desktop automation. Combines three automation approaches — low-level input control, the macOS accessibility API, and AppleScript/JXA — in a single production-grade server.

Most automation tools pick one approach. `claude-macos` uses all three:
- **Accessibility API first** — interact with apps by role and label, not pixel coordinates
- **Input control fallback** — mouse/keyboard via JXA CoreGraphics when a11y isn't enough
- **AppleScript/JXA escape hatch** — for apps with limited accessibility support

## Requirements

- macOS 12 or later
- Node.js 18+

### macOS Permissions

Grant the following in **System Settings → Privacy & Security**:

| Permission | Used for |
|------------|----------|
| **Accessibility** | Mouse/keyboard control, accessibility tree, window management |
| **Screen Recording** | Screenshots |
| **Automation** | Controlling other apps via AppleScript |

When you first run a tool that needs a permission, macOS will prompt you automatically. You can also grant them proactively by adding `Terminal` (or whichever app runs the MCP server) to each list.

## Setup

```bash
npm install
npm run build
```

## MCP Configuration

```json
{
  "mcpServers": {
    "claude-macos": {
      "command": "node",
      "args": ["/path/to/claude-macos/build/index.js"]
    }
  }
}
```

## Tools (23)

### Input Control

| Tool | Description |
|------|-------------|
| `mouse_move` | Move cursor to absolute coordinates |
| `mouse_click` | Click at coordinates — left/right/middle button, single or double |
| `mouse_drag` | Click-drag from one position to another |
| `type_text` | Type a string as keyboard input |
| `key_press` | Press a single key: `return`, `escape`, `tab`, `space`, `delete`, `f5`, arrow keys, etc. |
| `key_combo` | Key + modifiers: `{ key: "c", modifiers: ["cmd"] }` → Cmd+C |

### Accessibility API

| Tool | Description |
|------|-------------|
| `a11y_snapshot` | Full accessibility tree of any running app as JSON |
| `a11y_click` | Click a UI element by role and/or title — no coordinates needed |
| `a11y_set_value` | Set the value of a text field, slider, or other form element |
| `a11y_find` | Search the accessibility tree for elements matching a query |

### App & Window Management

| Tool | Description |
|------|-------------|
| `app_launch` | Launch an application by name |
| `app_quit` | Quit an application |
| `app_list` | List all currently running applications |
| `window_list` | List all open windows, optionally filtered by app |
| `window_focus` | Bring a window to the front |
| `window_resize` | Move and resize a window to specific coordinates and dimensions |

### Screen

| Tool | Description |
|------|-------------|
| `screenshot` | Capture the full screen or a region — returns base64 PNG |
| `screen_size` | Get the current screen resolution |

### System

| Tool | Description |
|------|-------------|
| `clipboard_read` | Read the current clipboard contents |
| `clipboard_write` | Write text to the clipboard |
| `notification_send` | Send a macOS notification with title, message, and optional subtitle |
| `run_applescript` | Execute arbitrary AppleScript and return the output |
| `run_jxa` | Execute JavaScript for Automation (JXA) and return the output |

## Usage Tips

**Prefer accessibility tools over coordinate-based input.** Use `a11y_snapshot` to see the app's element tree, then `a11y_click` or `a11y_set_value` to interact. This is more reliable than clicking at pixel coordinates, which break when windows move or screens resize.

**Use `screenshot` for orientation.** When working with an unfamiliar app, take a screenshot first to see the current state before deciding how to interact.

**AppleScript for app-specific automation.** Many macOS apps expose rich AppleScript dictionaries (`File → Open`, calendar events, mail composition). Use `run_applescript` for workflows that go beyond UI interaction.

## Troubleshooting

**"Not trusted for accessibility" error**
Open System Settings → Privacy & Security → Accessibility and add the app that runs the MCP server (typically Terminal or your shell).

**Screenshot returns black image**
Screen Recording permission is not granted. Open System Settings → Privacy & Security → Screen Recording and add your terminal app.

**AppleScript returns "not allowed to send keystrokes"**
Automation permission is missing. Open System Settings → Privacy & Security → Automation.

**Tool times out**
The target app may be unresponsive or the window may be minimized. Use `app_list` and `window_list` to verify the app state before retrying.
