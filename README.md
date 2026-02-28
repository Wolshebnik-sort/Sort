# Sort Imports

<p align="center">
  <img src="./icon.png" alt="Sort Imports Logo" width="128" />
</p>

Automatically sorts and organizes imports in JavaScript and TypeScript files with smart grouping, configurable ordering, and two sorting modes.

## What It Does

Sort Imports rewrites the top import section of a file into a predictable layout:

- Groups imports by category
- Sorts each group by `length` or `alphabetical`
- Sorts named imports inside `{ ... }`
- Preserves standalone comments collected from the import section
- Supports `import type`
- Sorts members inside `interface` and object-shaped `type` declarations
- Moves function and const declarations that were mixed into the import block after the sorted section
- Can run manually, on save, as a formatter, or through a Quick Fix / Source Action

## What's New

Patch changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

Current patch highlights in `0.0.2`:

- Added `spacing` support in `sortImports.groupsOrder`
- Improved alphabetical sorting for import statements and named specifiers
- Added safer handling for `import type`
- Extended member sorting for `interface` and structured `type` declarations, including nested object members

## Features

- 🚀 **Smart Sorting:** Imports are grouped by type and sorted by length
- 💬 **Comment Preservation:** Comments within import blocks are preserved in their original order
- 🔧 **Structured Type Sorting:** Interface properties and object-shaped type members are sorted inside the declaration body
- ⚡ **Function Extraction:** Functions and constants are extracted from import blocks and placed after
- ⚙️ **Configurable:** Ability to change maximum line length and path aliases
- 🔤 **Sorting Modes:** `length` (default) or `alphabetical`
- ⌨️ **Keyboard Shortcuts:** Ctrl+Alt+O (Windows/Linux) or Cmd+Alt+O (macOS)
- 📝 **Context Menu:** Command available in editor context menu
- 🎯 **Format Provider:** Works as a formatting provider
- 💡 **Code Action:** Quick Fix / Source Action `Sort Imports`
- 💾 **Sort On Save:** Optional automatic sorting on file save

## Import Grouping

Imports are grouped in the following order:

1. **Directives** — 'use client', 'use server'
2. **React** — react and react/\*
3. **External Libraries** — npm packages
4. **Absolute Imports** — paths with aliases (@/, ~/, src/)
5. **Relative Imports** — local files (., ..)
6. **Side Effect Imports** — imports without from
7. **Styles** — CSS, SCSS, SASS, LESS files
8. **Interfaces and Types** — TypeScript `interface` and object-shaped `type` declarations (including `export`) placed after imports; members are sorted according to the selected mode
9. **Comments** — preserved in their original order after imports
10. **Functions** — const, function, export const, export function declarations (at the very end)

Use `spacing` in `sortImports.groupsOrder` to insert blank lines exactly where you want them.

## Commands and Entry Points

- Command palette: `Sort Imports`
- Editor context menu: `Sort Imports`
- Keyboard shortcut: `Ctrl+Alt+O` on Windows/Linux, `Cmd+Alt+O` on macOS
- Formatter: available as a document formatting provider
- Code actions: `Quick Fix` and `Source: Sort Imports`
- Save hook: enabled with `sortImports.sortOnSave`

## Settings

> [!IMPORTANT]
> **Default settings are used automatically** if you don't set anything in `settings.json`.

```json
{
  "sortImports.maxLineLength": 100,
  "sortImports.indentSize": "  ",
  "sortImports.aliasPrefixes": ["@/", "~/", "src/"],
  "sortImports.styleExtensions": [".css", ".scss", ".sass", ".less"],
  "sortImports.groupsOrder": [
    "directives",
    "spacing",
    "react",
    "spacing",
    "libraries",
    "spacing",
    "absolute",
    "spacing",
    "relative",
    "spacing",
    "sideEffect",
    "spacing",
    "styles",
    "spacing",
    "interfaces",
    "spacing",
    "comments",
    "spacing",
    "functions"
  ],
  "sortImports.sortOnSave": false,
  "sortImports.sortMode": "length"
}
```

You do not need to copy default values into `settings.json` unless you want to change them.

To override and extend settings, add only the values you want to change in your workspace or user `settings.json`:

```json
{
  "sortImports.maxLineLength": 120,
  "sortImports.sortOnSave": true,
  "sortImports.styleExtensions": [".css", ".scss", ".sass", ".less", ".pcss"],
  "sortImports.groupsOrder": [
    "directives",
    "spacing",
    "comments",
    "react",
    "libraries",
    "spacing",
    "absolute",
    "styles",
    "spacing",
    "relative",
    "sideEffect",
    "interfaces",
    "functions"
  ],
  "sortImports.aliasPrefixes": ["@/", "~/", "src/", "@core/", "@shared/"],
  "sortImports.sortMode": "alphabetical"
}
```

Notes:
- `sortImports.maxLineLength`: maximum line length before wrapping imports.
- `sortImports.indentSize`: indentation used for wrapped import lines.
- `sortImports.aliasPrefixes`: alias prefixes used to detect absolute imports. Extend this array with your project aliases.
- `sortImports.styleExtensions`: extensions treated as style imports.
- `sortImports.groupsOrder`: custom output order. Available groups: `directives`, `react`, `libraries`, `absolute`, `relative`, `sideEffect`, `styles`, `interfaces`, `comments`, `functions`. Add `"spacing"` as a separate array item to insert an empty line exactly where you want it.
- `sortImports.sortOnSave`: automatically sort imports on file save.
- `sortImports.sortMode`: `length` (default behavior) or `alphabetical`.
- In `length` mode, sorting behavior remains the current default (by length).
- In `alphabetical` mode, non-React import groups are sorted alphabetically, and named imports inside `{ ... }` are sorted alphabetically.

## Example Configuration

Minimal setup:

```json
{
  "sortImports.sortOnSave": true
}
```

More explicit setup with custom group spacing:

```json
{
  "sortImports.sortMode": "alphabetical",
  "sortImports.sortOnSave": true,
  "sortImports.aliasPrefixes": ["@/", "~/", "src/", "@shared/"],
  "sortImports.groupsOrder": [
    "directives",
    "spacing",
    "react",
    "spacing",
    "libraries",
    "spacing",
    "absolute",
    "spacing",
    "relative",
    "spacing",
    "styles",
    "spacing",
    "interfaces",
    "spacing",
    "comments",
    "spacing",
    "functions"
  ]
}
```

## Demo

![Sort Imports Demo](./demo.gif)

## Example

**Before:**

```ts
import './styles.css';
import { Component } from 'react';
// Comment about utils
import { someUtilFunction, anotherFunction } from '../utils/helpers';
import axios from 'axios';
/* Comment about API service */
import { apiCall } from '@/services/api';
import lodash from 'lodash';

interface User {
  verylongpropertynamefortest: string;
  id: number;
  name: string;
  email: string;
  age: number;
}
```

**After:**

```ts
import { Component } from 'react';

import axios from 'axios';
import lodash from 'lodash';

import { apiCall } from '@/services/api';

import { someUtilFunction, anotherFunction } from '../utils/helpers';

import './styles.css';

interface User {
  id: number;
  age: number;
  name: string;
  email: string;
  verylongpropertynamefortest: string;
}

// Comment about utils
/* Comment about API service */
```

## Usage

1. Open a `.js`, `.ts`, `.jsx`, or `.tsx` file.
2. Run **Sort Imports** from the command palette, editor context menu, or keyboard shortcut.
3. Optionally enable `"sortImports.sortOnSave": true` to apply sorting automatically on save.
4. Optionally use the extension as a formatter or from the `Source` / `Quick Fix` code actions.

## Supported Files

- JavaScript (.js)
- TypeScript (.ts)
- JSX (.jsx)
- TSX (.tsx)

## Requirements

- VS Code version 1.74.0 or higher
- JavaScript/TypeScript files

## Change Log

See [CHANGELOG.md](./CHANGELOG.md) for patch-by-patch updates.

## License

MIT
