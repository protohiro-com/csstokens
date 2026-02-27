# csstokens

`csstokens` is a TypeScript CLI to extract design tokens from existing CSS, SCSS, JS, JSX, TS, and TSX codebases.

It scans frontend repositories, finds repeated colors, spacing, shadows, and CSS variables, then generates deterministic token outputs for design system cleanup and migration work.

Use it when you want to turn an existing codebase into:
- `raw-index.json` with detected values and occurrences
- `tokens.json`
- `tokens.css`
- `tokens.ts`
- `report.md`

## Requirements

- Node.js 20+
- pnpm 9+

## Install

```bash
npm install -g @protohiro/csstokens
csstokens --help
```

## CLI usage

```bash
csstokens --help
```

### Default extract from current folder

```bash
csstokens
csstokens --profile strict
```

### Analyze

```bash
csstokens analyze ./examples/messy-ui
```

Generates:
- `./csstokens-out/raw-index.json`
- `./csstokens-out/report.md`

### Extract

```bash
csstokens extract ./examples/messy-ui --prefix pt
csstokens extract ./examples/messy-ui --profile strict
```

Generates:
- `./csstokens-out/raw-index.json`
- `./csstokens-out/report.md`
- `./csstokens-out/tokens.json`
- `./csstokens-out/tokens.css`
- `./csstokens-out/tokens.ts`

## Flags

- `--out <dir>` default: `./csstokens-out`
- `--include <glob>` repeatable, default: `**/*.{css,scss,tsx,ts,jsx,js}`
- `--exclude <glob>` repeatable, default: `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`
- `--prefix <string>` default: `pt`
- `--format simple` only `simple` is currently supported
- `--profile <name>` `balanced` or `strict`
- `--min-count <number>` override minimum count threshold for final token candidates
- `--min-file-count <number>` override minimum file spread threshold for final token candidates
- `--source-ignore <glob>` repeatable, ignore matched files for ranking/tokenization
- `--config <path>` explicit config file path
- `--dry-run` analyze and print summary without writing files

## Development

If you are working on the repository itself:

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Repo config

The CLI auto-loads `csstokens.config.json` or `.csstokensrc.json` from the analyzed repo root.

Example:

```json
{
  "profile": "strict",
  "include": ["src/**/*.{css,scss,ts,tsx,js,jsx}"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "sourceIgnorePatterns": ["**/*.stories.tsx", "**/generated/**"],
  "thresholds": {
    "minCount": 3,
    "minFileCount": 2
  }
}
```

## Example `report.md` fragment

```md
## Summary
- Files scanned: 2
- Entries: 20
- Color values: 8
- Length values: 9
- Shadow values: 2
- CSS var definitions: 3
- CSS var usages: 1

## Recommendations
- Detected 5 unique normalized colors.
- Found 3 near-duplicate color pairs for possible merge.
```

## Example `tokens.css` fragment

```css
:root {
  --pt-color-blue-100: #3355ff;
  --pt-color-blue-500: #3366ff;
  --pt-color-blue-900: #3377ff;
  --pt-radius-0: 6px;
  --pt-space-0: 8px;
  --pt-shadow-1: 0 1px 4px rgba(0,0,0,0.12);
}
```

## Project structure

- `packages/core` parsing, normalization, grouping, emitters
- `packages/cli` command parsing, globbing, file IO, user-facing errors
- `examples/messy-ui` fixture repository used by golden tests

## Deterministic output guarantees

- sorted file processing
- sorted index entries
- sorted token keys
- stable tie-breakers for naming/grouping
- no timestamps/randomness in generated files

## Current heuristics

- source filtering skips likely Storybook, generated, palette, and theme-dump files from token candidate ranking
- each raw index entry gets a simple `confidence` score based on frequency, file spread, and property context
- spacing and radius token generation is limited to common token-like ranges to avoid one-off layout values
- near-duplicate colors are reported as mergeable clusters instead of an unbounded pair list
- final color tokens are split into `text`, `surface`, `border`, `primary`, `accent`, and `status.*` candidates
- `strict` profile emits a smaller token set with higher thresholds

## Tests

- unit tests: color normalization
- unit tests: spacing/radius sorting
- golden snapshots: `tokens.json`, `tokens.css`, `report.md`, `raw-index.json`

## Known limitations

- regex-based parsing; no full AST support
- line/column detection is approximate in some complex TSX template cases
- limited color parser (common hex/rgb/hsl forms only)
- `box-shadow` detection focuses on direct `box-shadow: ...` declarations
- typography extraction is heuristic (`font-size`, `font-weight`, `font-family`)
- no automatic code refactor from literals to CSS vars/tokens
