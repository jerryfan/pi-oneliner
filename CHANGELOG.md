# Changelog

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
