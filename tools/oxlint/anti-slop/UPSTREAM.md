# Upstream provenance

- Source: `https://github.com/dmmulroy/anti-slop`
- Previous generic-plugin base: `6d538555cb151d4121ed51a27db81890eacf8ae9`
- Updated generic-plugin snapshot: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Installed entry point: `tools/oxlint/anti-slop/index.ts`
- Updated: 2026-09-10

The repository intentionally omits the optional `anti-slop-effect` plugin because
it does not declare a direct `effect` dependency. Generic plugin files match the
bundled upstream snapshot. The nested `vendor/eslint-stylistic/UPSTREAM.md`
records the source of the vendored readable-spacing implementation.

Upstream's rule tests and typecheck passed with its declared pnpm 10.33.0 toolchain.
The readable-spacing autofix added 150 blank lines across 33 local files; a second
fix and formatting pass made no further changes. The final `vp check` reported no
anti-slop findings. One pre-existing TypeScript error remains in `src/App.test.tsx`,
along with nine unrelated React warnings.

The project test suite completed with 89 passing and 5 failing tests. All five
failures are in `electron/database/database.test.ts` and concern the existing
database schema and migration expectations, outside this plugin update.
