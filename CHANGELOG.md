# Change Log

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current extension workflow.

## [0.0.5] - 2026-03-02

### Added

- Support for sorting CSS/SCSS/SASS/LESS property declarations inside style blocks.
- Recursive style sorting for nested selectors and nested at-rules such as `@media`.
- Regression tests for style sorting and project-alias detection behavior.
- A `sortImports.enableStyleSorting` setting so style-file sorting can be enabled explicitly instead of running by default.
- A `sortImports.styleGroupsOrder` setting to reorder built-in style property groups without redefining individual property order.

### Changed

- Refactored the internal sorting pipeline from `sortImports/*` into a broader `sortContent/*` structure.
- Split the style sorting implementation into smaller modules for parser, formatter, property order, and node types.
- Style sorting now supports built-in group families such as `padding-*`, `margin-*`, `flex-*`, `grid-*`, and keeps CSS custom properties (`--*`) at the top of each block.
- SCSS interpolation inside declarations such as `#{$color}` is now handled safely during style parsing.
- `sortImports.mergeDuplicateImports` is now disabled by default and must be enabled explicitly when desired.
- Updated the extension naming to `Sort Imports & Styles` in commands and configuration UI text.
- Updated the README to document the broader imports-and-styles behavior, current defaults, style group ordering, and the project-config alias detection behavior.
- Updated the build script to clean `out/` before compilation so packaged VSIX files do not include stale artifacts from old module paths.

## [0.0.4] - 2026-02-28

### Added

- A `sortImports.mergeDuplicateImports` setting to control whether compatible duplicate imports are merged during sorting.
- A `sortImports.detectAliasesFromProjectConfig` setting to auto-detect alias prefixes from nearby `tsconfig.json` / `jsconfig.json` files and simple Vite or webpack alias definitions when enabled.

### Changed

- Duplicate-import merging remains enabled by default, but can now be disabled per user or workspace settings.
- Alias resolution now combines manual prefixes, detected project aliases, and the built-in defaults in a stable order.
- Imports from groups omitted in `sortImports.groupsOrder` now stay in place instead of being moved to the bottom of the section.
- Updated the README to explain project-specific configuration via `./.vscode/settings.json` and how different projects can use different sorting rules.

## [0.0.3] - 2026-02-28

### Added

- Support for merging compatible duplicate imports from the same source within the same output group.
- A dedicated `Preview Sort Imports` command that opens a side-by-side diff before applying changes.
- A dedicated `Apply Sort Imports` command for explicitly applying the sorted result.
- Keyboard shortcuts for preview/apply workflows:
  - `Cmd+Alt+I` / `Ctrl+Alt+I` for preview
  - `Cmd+Alt+O` / `Ctrl+Alt+O` for apply

### Changed

- Refactored sorting internals into dedicated `src/sortImports/*` modules for block collection, config normalization, import formatting, and structured type sorting.
- Updated the README to document preview/apply workflows and keyboard-driven usage.
- Bumped the package version from `0.0.2` to `0.0.3`.

## [0.0.2] - 2026-02-28

### Added

- Support for `spacing` entries in `sortImports.groupsOrder` so blank lines can be placed explicitly between output groups.
- A dedicated changelog file to document patch-level updates.

### Changed

- Updated the default group order to include visual separators between major import groups.
- Improved import formatting so named specifiers inside `{ ... }` are sorted according to the selected mode.
- Improved alphabetical sorting for full import statements by import source and clause shape.
- Added safer parsing and formatting for `import type` declarations.
- Extended member sorting from interfaces to object-shaped type declarations as well.
- Added recursive sorting for nested structured members inside interface/type object bodies.
- Expanded README documentation to cover configuration, execution modes, and patch highlights.

### Notes

- Package version was bumped from `0.0.1` to `0.0.2`.
