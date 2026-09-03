# Demo-data sanity scripts

Dev-only Node scripts that run the **real** WorkLens capacity / turnover engine against
the seed data in `src/data/*`, so the demo dataset can be tuned to a realistic,
non-overloaded spread. Not part of the app build (`scripts/` is excluded in
`tsconfig.json`).

Run with Node's native TypeScript support + a small `@/` path resolver:

```
node --import ./scripts/paths-hook.mjs scripts/capcheck.ts        # per-employee weekly utilization
node --import ./scripts/paths-hook.mjs scripts/handovercheck.ts   # the seeded turnover scenario
node --import ./scripts/paths-hook.mjs scripts/coveragecheck.ts   # applying time-boxed coverage
```
