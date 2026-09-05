# Demo-data / scheduling-engine sanity scripts

Dev-only Node scripts that run the **real** WorkLens capacity / scheduling / turnover
engine against seed or synthetic data — used to tune the demo dataset and to verify
engine changes without needing the app running against Supabase. Not part of the app
build (`scripts/` is excluded in `tsconfig.json`).

Run with Node's native TypeScript support + a small `@/` path resolver:

```
node --import ./scripts/paths-hook.mjs scripts/capcheck.ts             # per-employee weekly utilization (seed data)
node --import ./scripts/paths-hook.mjs scripts/handovercheck.ts        # the seeded turnover scenario
node --import ./scripts/paths-hook.mjs scripts/coveragecheck.ts        # applying time-boxed coverage
node --import ./scripts/paths-hook.mjs scripts/futurecapacity-test.ts  # Scenario A: forward-looking assignment
node --import ./scripts/paths-hook.mjs scripts/ranking-test.ts         # candidate ranking prefers forward fit
node --import ./scripts/paths-hook.mjs scripts/calendarevent-test.ts   # Scenario D: calendar events reduce capacity
node --import ./scripts/paths-hook.mjs scripts/lunch-test.ts           # Scenario E: nothing scheduled over lunch
```
