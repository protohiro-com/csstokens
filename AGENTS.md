Guidelines for AI agents working on the `csstokens` repository.

This project is an open-source CLI tool that extracts design tokens from
existing frontend codebases and generates structured tokens and reports.

Primary goals:

- Fast CLI
- Deterministic output
- Minimal dependencies
- Excellent DX
- Simple architecture
- Easy maintenance by a solo developer

Agents should prioritize simplicity and predictability over cleverness.

---

# Core Principles

## 1. Deterministic Output (CRITICAL)

Given the same input files, output must be identical.

Always:

- Sort object keys
- Sort arrays
- Use stable naming
- Avoid randomness
- Avoid timestamps in output

Never:

- Depend on file system ordering
- Depend on object iteration order

This ensures snapshot tests remain stable.

---

## 2. Architecture Boundaries

### packages/core

Pure logic only.

Allowed:

- parsing
- normalization
- grouping
- token generation
- emitters

Not allowed:

- console output
- CLI flags logic
- process.exit
- filesystem writes (except through passed interfaces)

Core must be reusable as a library.

---

### packages/cli

Responsible for:

- command parsing
- user messages
- file IO
- configuration
- exit codes

CLI must be a thin wrapper around core.

---

## 3. Performance Requirements

The tool should handle medium repositories quickly.

Targets:

- <5 seconds for small repos
- <10 seconds for medium repos

Avoid:

- full AST parsing unless absolutely necessary
- loading entire repo into memory if avoidable
- unnecessary object copying

Prefer:

- streaming where reasonable
- simple regex extraction
- linear passes

---

## 4. Dependencies Policy

Keep dependencies minimal.

Preferred:

- fast-glob
- commander or yargs
- picocolors or chalk (optional)
- vitest

Avoid:

- heavy AST frameworks
- webpack
- babel
- runtime transpilers

Justify any new dependency.

---

## 5. Code Style

Goals:

- readable
- small functions
- predictable structure

Prefer:

- pure functions
- explicit types
- early returns

Avoid:

- deep abstraction
- unnecessary generics
- class hierarchies

This is a utility tool, not a framework.

---

## 6. File Organization

Core structure:

packages/core/src/

    extractors/
        colors.ts
        lengths.ts
        shadows.ts
        cssVars.ts

    grouping/
        colors.ts
        spacing.ts
        radius.ts
        shadow.ts

    emitters/
        json.ts
        css.ts
        ts.ts
        report.ts

    model/
        RawValue.ts
        TokenCandidate.ts

    utils/
        normalizeColor.ts
        sortStable.ts

CLI structure:

packages/cli/src/

    commands/
        analyze.ts
        extract.ts

    config.ts
    logger.ts
    index.ts

---

## 7. Token Naming Rules

Names must be stable.

Example:

color.blue.500
space.2
radius.1
shadow.1

Never rename tokens without strong reason.

Naming changes break users.

---

## 8. Testing Requirements

Snapshot tests are critical.

When changing extraction logic:

- Update snapshots intentionally
- Verify output is still reasonable

Required tests:

- color normalization
- spacing sorting
- deterministic output

Golden test:

extract examples/messy-ui
→ snapshot tokens.json
→ snapshot tokens.css
→ snapshot report.md

---

## 9. Output Format Stability

Output formats are public API.

Do not change:

- tokens.json structure
- CSS variable naming
- report sections

Without updating:

- README
- tests
- snapshots

---

## 10. Error Handling

Errors must be clear.

## 11. CLI UX Rules

CLI must feel lightweight.

Good:


✔ Found 128 colors
✔ Generated tokens.json
✔ Generated report.md


Avoid:

- verbose logs by default
- debug noise

Optional later:


--verbose


---

## 12. Scope Discipline

This is a **token extractor**, not a platform.

Do NOT implement:

- UI dashboards
- web servers
- cloud sync
- login systems

Allowed future features:

- refactor command
- tailwind export
- dtcg format

---

## 13. Agent Workflow

When implementing a feature:

1. Modify core
2. Add tests
3. Update CLI if needed
4. Run tests
5. Verify deterministic output

Always ensure:


pnpm install
pnpm build
pnpm test


passes.

---

## 14. Simplicity Rule

If two approaches exist:

Pick the simpler one.

Simple > Clever.

Readable > Abstract.

---

## 15. Project Vision

protohiro-tokens should feel like:

- small
- sharp
- fast
- reliable

Similar spirit to:

- prettier
- eslint (early versions)
- simple unix tools

Not like:

- enterprise platforms
- design systems SaaS

---

# End of AGENTS.md