# @protohiro/csstokens-core

`@protohiro/csstokens-core` provides the extraction, normalization, grouping, and emitter logic behind the `csstokens` design token extractor.

Use it when you need library access to design token extraction from existing frontend codebases.

## Install

```bash
npm install @protohiro/csstokens-core
```

## Usage

```ts
import { extractFiles } from '@protohiro/csstokens-core';
```

The package is intended for library use. For filesystem scanning and end-user commands, use `csstokens`.
