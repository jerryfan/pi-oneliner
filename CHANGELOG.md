# Changelog

## 1.3.0 - 2026-04-21

### Changed
- npm package renamed to `@jrryfn/pi-oneliner`.
- Session name is now plain text in session-first layout.
- Short cwd mode now shows the last two path segments, e.g. `code\pi` for `C:\code\pi`.

## 1.2.0 - 2026-04-21

### Changed
- New default footer layout optimized for multi-window workflows: session name first, statuses on the right.
- Locale badge is now 1–2 characters (e.g. "En").
- Status segment no longer emits "+N" overflow.
- Added config keys: `layout` and `shortCwd`.

## 1.1.9 - 2026-04-20

### Changed
- Locale badge now resolves the active pi-i18n locale at render time so it does not freeze at startup.

## 1.1.8 - 2026-04-20

### Changed
- Locale badge now re-reads the active pi-i18n locale on render so it stays current after startup.

## 1.1.7 - 2026-04-20

### Changed
- Locale badge now prefers native labels with a short-code fallback on tight widths.

## 1.1.6 - 2026-04-20

### Changed
- Locale badge now shows native language labels (e.g. 日本語, 한국어, Español) instead of 2-letter codes.

## 1.1.5 - 2026-04-20

### Added
- New locale bundles: zh-CN, ja, ko, es, pt-BR, fr, de.

### Changed
- Registers all shipped locale bundles from `locales/*.json` when pi-i18n is installed.

## 1.1.4 - 2026-04-19

### Fixed
- govern status coloring is now glyph-based, so it stays readable in non-English locales.

## 1.1.3 - 2026-04-19

### Fixed
- Footer now re-renders immediately on `pi-i18n/localeChanged` and reliably updates the locale badge.

## 1.1.2 - 2026-04-19

### Fixed
- Removed remaining legacy typo naming mentions.
- Standardized docs/config/env references to `oneliner`.

## 1.1.1 - 2026-04-19

### Fixed
- npm package identity corrected to `@jrryfn/oneliner`.
- README install instructions updated to scoped package name.

## 1.1.0 - 2026-04-19

### Changed
- Renamed primary command to `/oneliner`.
- Standardized command naming to `/oneliner`.
- Migrated primary config path to `~/.pi/agent/oneliner.json` with legacy fallback.
- Warning band (40-49%) remains non-bold; bold starts at >=50%.

### Added
- `/oneliner doctor` quick health check.
- `/oneliner zen` one-shot compact mode (`compact` + statuses off).

## 1.0.0 - 2026-04-19

Initial public release candidate.
