# Contributing

## Local smoke test

1. Copy `index.ts` to `~/.pi/agent/extensions/oneliner/index.ts`
2. In pi, run `/reload`
3. Run `/oneliner` and verify picker opens
4. Switch models and verify aliases:
   - GPT-5.4 -> `5.4`
   - GPT-5.4 Mini -> `5.4m`
   - GPT-5.3 Codex -> `5.3c`
5. Run `/oneliner doctor` (should report healthy)
6. Resize terminal to confirm one-line fallback behavior

## PR expectations

- Keep footer one-line only
- Preserve strict alias semantics (`c` Codex-only, `m` Mini-only)
- Keep status aggregation text-only
- Update `CHANGELOG.md` for user-visible changes
