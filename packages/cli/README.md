# csstokens

`csstokens` is a CLI to extract design tokens from existing CSS, SCSS, JS, JSX, TS, and TSX codebases.

It scans frontend repositories and emits deterministic outputs for token migration, design system cleanup, and CSS variable standardization.

## Install

```bash
npm install -g @protohiro/csstokens
```

## Usage

```bash
csstokens
csstokens --profile strict
csstokens analyze
csstokens extract ./src --prefix ct
csstokens refactor ./src --dry-run
```

By default, `csstokens` runs extraction for the current directory and writes output to `./csstokens-out`.

`refactor --dry-run` prints a summary of proposed literal-to-token replacements. Without `--dry-run`, it writes `refactor-plan.md` and `refactor-plan.json`.
