# csstokens

`csstokens` is a CLI that scans an existing frontend codebase and emits deterministic design token outputs.

## Install

```bash
npm install -g csstokens
```

## Usage

```bash
csstokens
csstokens --profile strict
csstokens analyze
csstokens extract ./src --prefix ct
```

By default, `csstokens` runs extraction for the current directory and writes output to `./csstokens-out`.
