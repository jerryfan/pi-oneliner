# oneliner

One-line sticky footer extension for [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

`oneliner` is built for **high signal density** and **zero-wrap output**.

## Install (npm)

> Important: install with `pi install`, **not** `npm install`.

```bash
pi install npm:@jrryfn/oneliner
```

Then in pi:

```text
/reload
/oneliner show
```

Project-local install (shared in `.pi/settings.json`):

```bash
pi install -l npm:@jrryfn/oneliner
```

## Fast troubleshooting

- **"Package not found"**
  - Use the full scoped name: `npm:@jrryfn/oneliner`
- **Installed but `/oneliner` is unknown**
  - Run `/reload` (or restart pi)
- **Installed old package name before**
  - Remove old package, then reinstall:

```bash
pi remove npm:@jrryfn/oneliner
pi install npm:@jrryfn/oneliner
```

## Commands

- `/oneliner`

## License

MIT
