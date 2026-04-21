# pi-oneliner

One-line sticky footer extension for [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

`oneliner` is built for **high signal density** and **zero-wrap output**.

## Install (npm)

> Important: install with `pi install`, **not** `npm install`.

```bash
pi install npm:@jrryfn/pi-oneliner
```

Then in pi:

```text
/reload
/oneliner show
```

Project-local install (shared in `.pi/settings.json`):

```bash
pi install -l npm:@jrryfn/pi-oneliner
```

## Fast troubleshooting

- **"Package not found"**
  - Use the full scoped name: `npm:@jrryfn/pi-oneliner`
- **Installed but `/oneliner` is unknown**
  - Run `/reload` (or restart pi)
- **Installed old package name before**
  - Remove old package, then reinstall:

```bash
pi remove npm:@jrryfn/oneliner
pi install npm:@jrryfn/pi-oneliner
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

## License

MIT
