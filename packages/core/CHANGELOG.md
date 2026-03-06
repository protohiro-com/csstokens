# csstokens-core

## 0.2.0

### Minor Changes

- 339f88e: Improve extraction quality and add refactor dry-run planning.

  - apply source-ignore rules only to token ranking while keeping raw analysis complete
  - validate CLI threshold flags and speed up file loading with parallel reads
  - tighten color-role heuristics for more stable text, surface, status, and brand token grouping
  - add `refactor` planning APIs in core and a `csstokens refactor --dry-run` command in the CLI
  - update reports and docs to reflect occurrence counts and ranking-ignore behavior

## 0.1.1

### Patch Changes

- d7cc9e7: Prepare npm publishing and automated releases with Changesets.
