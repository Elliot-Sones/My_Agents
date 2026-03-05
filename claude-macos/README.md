# claude-macos MCP Server

MCP server for macOS desktop automation. Provides mouse/keyboard control, accessibility tree inspection, window management, screenshots, clipboard access, and AppleScript/JXA execution.

## Requirements

- macOS 12+
- Node.js 18+

### Required macOS Permissions

Grant these in **System Settings > Privacy & Security**:

- **Accessibility**: Required for mouse/keyboard control, accessibility tree, and window management
- **Screen Recording**: Required for screenshots
- **Automation**: Required for controlling other applications via AppleScript

## Setup

```bash
npm install
npm run build
```

## MCP Configuration

Add to your Claude Desktop or MCP client config:

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

## Tools

### Input Control
- `mouse_move` - Move cursor to coordinates
- `mouse_click` - Click at position (left/right/middle, single/double)
- `mouse_drag` - Drag from one position to another
- `type_text` - Type a string of text
- `key_press` - Press a single key (including special keys)
- `key_combo` - Press key combinations with modifiers (Cmd+C, etc.)

### Accessibility
- `a11y_snapshot` - Get accessibility tree of an application
- `a11y_click` - Click UI elements by role/title
- `a11y_set_value` - Set value of form fields
- `a11y_find` - Search accessibility tree for elements

### Window & App Management
- `app_launch` - Launch an application
- `app_quit` - Quit an application
- `app_list` - List running applications
- `window_list` - List open windows
- `window_focus` - Bring window to front
- `window_resize` - Move and resize windows

### Screen
- `screenshot` - Capture screen or region (returns base64 PNG)
- `screen_size` - Get screen resolution

### System
- `clipboard_read` - Read clipboard contents
- `clipboard_write` - Write to clipboard
- `notification_send` - Send macOS notifications
- `run_applescript` - Execute arbitrary AppleScript
- `run_jxa` - Execute JavaScript for Automation
