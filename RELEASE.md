# pi-oneliner Release Plan (lean, npm-first)

## 1) Package setup

- Ensure `oneliner/package.json` has the publishable npm name/version.
- Confirm `pi.extensions` points to `./index.ts`.
- Keep `files` minimal (`index.ts`, docs, config example, license).

## 2) Quality gate

Before tagging, verify in a real pi session:

- `/reload` loads extension cleanly
- `/oneliner` opens picker
- One-line footer never wraps at common terminal widths
- Alias mapping checks:
  - GPT-5.4 -> `5.4`
  - GPT-5.2 -> `5.2`
  - GPT-5.4 Mini -> `5.4m`
  - GPT-5.3 Codex -> `5.3c`
- Non-Codex models never show `c`
- Segment spacing remains single-space

## 3) Pack + publish

From repo root:

```bash
npm run pack:oneliner
npm run publish:oneliner
```

Or from folder:

```bash
cd oneliner
npm pack --dry-run
npm publish --access public
```

## 4) Launch checklist

- Tag: `pi-oneliner-v<version>`
- GitHub release notes include changelog excerpt + screenshot/GIF
- Add npm install snippet to release body:
  - `pi install npm:@jrryfn/pi-oneliner`

