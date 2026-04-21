# pi-oneliner

One-line sticky footer extension for [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

`oneliner` is built for **high signal density** and **zero-wrap output**.

## Install (npm)

> Important: install with `pi install`, **not** `npm install`.

```bash
pi install npm:pi-oneliner
```

Then in pi:

```text
/reload
/oneliner show
```

Project-local install (shared in `.pi/settings.json`):

```bash
pi install -l npm:pi-oneliner
```

## Fast troubleshooting

- **"Package not found"**
  - Use the full package name: `npm:pi-oneliner`
- **Installed but `/oneliner` is unknown**
  - Run `/reload` (or restart pi)
- **Installed old package name before**
  - Remove old package, then reinstall:

```bash
pi remove npm:pi-oneliner
pi install npm:pi-oneliner
```

## Commands

- `/oneliner`

## Config

Config file:

- `~/.pi/agent/oneliner.json`

Example:

- `example.json`

Useful keys:
- `layout`: `"sessionFirst"` (default) or `"classic"`
- `shortCwd`: `true` to show the last two cwd segments (e.g. `code\pi`)

### Statuses (no hardcoded extension keys)

By default, oneliner will render whatever extension statuses exist (`ctx.ui.setStatus(key, value)`), subject to width + preset.

You can control which status keys appear (and their ordering) without modifying oneliner:

```json
{
  "status": {
    "enabled": true,
    "right": {
      "mode": "allowlist",
      "allow": ["pi-semantic", "govern"],
      "priority": ["pi-semantic"],
      "maxVisible": 2
    },
    "classic": { "mode": "auto" },
    "preserveSymbols": "keep"
  }
}
```

Notes:
- `right` applies to the session-first right-side block (next to locale).
- `classic` applies to classic layout’s main-line status segment.
- Legacy `showStatuses` still works; prefer `status.enabled`.

## License

MIT
