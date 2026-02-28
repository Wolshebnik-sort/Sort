# Change Log

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current extension workflow.

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
