# Security policy

## Supported version

Security fixes are applied to the current `2.x` desktop release. Dependencies are
locked by `package-lock.json`; production builds require Node.js 22.12 or newer.

## Dependency audit

CI runs `npm audit --audit-level=critical`, including the build toolchain. Advisories inherited from
the fixed `@teselagen/ove@0.8.42` dependency are reviewed separately because no
compatible upstream release currently removes all of them. They are not ignored:
the renderer remains sandboxed and context-isolated, has no Node.js access, uses a
restrictive CSP, rejects navigation and new windows, and can invoke only validated,
named IPC methods.

Changing or overriding OVE's transitive packages requires the complete behavior,
visual, and performance suite. This avoids silently changing editor behavior to
make an audit report green.

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the repository
maintainers privately with the affected version, reproduction steps, and impact.
