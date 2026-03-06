# @protohiro/csstokens-core

`@protohiro/csstokens-core` provides the extraction, normalization, grouping, and emitter logic behind the `csstokens` design token extractor.

Use it when you need library access to design token extraction from existing frontend codebases.

## Install

```bash
npm install @protohiro/csstokens-core
```

## Usage

```ts
import { buildRefactorPlan, extractFiles } from '@protohiro/csstokens-core';
```

The package is intended for library use. For filesystem scanning and end-user commands, use `csstokens`.

You can also build a dry-run replacement plan from extracted tokens and the raw index:

```ts
const result = extractFiles(files, { prefix: 'pt' });
const plan = buildRefactorPlan(result.rawIndex, result.tokens, 'pt');
```
