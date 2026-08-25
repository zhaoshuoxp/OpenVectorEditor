# Changelog

## 2.1.3

- Fixed repository resolution when publishing the assembled GitHub Release.
- Avoided duplicate cross-architecture Linux packages in matrix release jobs.
- Made Windows installer and portable artifact names URL-safe and deterministic.

## 2.1.2

- Fixed unsigned macOS packaging when signing secrets are not configured.

## 2.1.1

- Added the application screenshot and downloadable release information to the README.
- Added automated Windows, macOS Intel/Apple Silicon and Linux x64/arm64 release packaging.
- Fixed Electron E2E toolbar selectors for OVE's accessible anchor buttons.

## 2.1.0

- Re-established the project as an independent TypeScript desktop application.
- Removed legacy Electron 22 JavaScript, old CI configuration, build caches, duplicate fixtures and historical archives.
- Kept OVE exclusively as the pinned `@teselagen/ove@0.8.42` npm dependency behind `EditorEngine`.
- Added Electron 43, React, strict TypeScript, named IPC, sandboxed preload and cross-platform packaging.
- Added local Primer3, BioMSA alignment, version history, automatic annotation and compatibility tooling.
- Added unit, Electron E2E, visual regression, performance and three-platform CI suites.
- Fixed packaged renderer asset paths and sandbox preload loading on macOS.

## 2.0.2

- Fixed the sandboxed preload bundle so it has no unsupported runtime dependencies.
- Added build-time validation for preload isolation and packaged renderer assets.

## 2.0.1

- Fixed blank packaged windows caused by absolute Vite asset paths under `file://`.
