# Contributing to Oh My Pi Desktop

Thanks for helping out. This is an Electron + React (electron-vite) app that
drives the `omp` agent over its RPC protocol. The bar for a change is simple:
CI stays green and the diff is honest about what it does.

## Prerequisites

- **Node ≥ 22.12.0 and npm ≥ 10** (`engines` in `package.json` enforces the floor;
  earlier 22.x fails the jsdom renderer tests with an ESM `require()` error).
- **`omp` installed** — only needed for the app to actually connect, and for the
  E2E tests. The unit tests run against a mock `omp` and need no real agent.

## Setup

```bash
git clone https://github.com/dylansantwani/oh-my-pi-desktop.git
cd oh-my-pi-desktop
npm ci        # reproducible install from package-lock.json
```

`npm ci` (not `npm install`) keeps you on the pinned lockfile. The `allowScripts`
policy in `package.json` approves the install scripts npm gates behind approval.

## Everyday commands

```bash
npm run dev          # electron-vite dev server + app window, with HMR
npm test             # unit tests: protocol vs. a mock omp + jsdom component tests
npm run test:watch   # vitest in watch mode
npm run typecheck    # tsc over main and renderer tsconfigs
npm run build        # electron-vite build (esbuild — does NOT typecheck)
RUN_E2E=1 npm test   # adds integration tests against a real omp (needs a provider)
npm run gen:icon     # regenerate icon.png/.icns/.ico from build/icon.svg
```

> `npm run build` uses esbuild, which strips types without checking them. A type
> error can pass a green build and only surface at runtime, so **`npm run typecheck`
> is the real gate** — run it before you push. CI runs it before the tests.

## The gate your PR has to pass

CI (`.github/workflows/ci.yml`) runs on Ubuntu, macOS, and Windows for every push
and PR to `main`. Before opening a PR, run the same steps locally:

```bash
npm run typecheck && npm test && npm run build
```

CI additionally verifies the packaged `out/main` and `out/preload` bundles import
nothing but Node builtins and `electron` (a new main-process dependency would leave
a bare `require()` in the packaged app and crash it at launch), and regenerates the
icons on every OS. If you add a runtime dependency to the **main** process, bundle
it via `externalizeDepsPlugin({ exclude: [...] })` in `electron.vite.config.ts`.

## Code style

- **2-space indent, LF, final newline** — enforced by `.editorconfig`.
- TypeScript throughout. No `any` where a real type will do; the typecheck is the
  arbiter.
- The renderer is a **pure projection** of RPC events: no Node, no filesystem, no
  agent logic. Anything privileged goes through the typed `window.omp`
  `contextBridge` API in `src/preload`. Keep `nodeIntegration` off.
- Add or update tests for behavior you change. Protocol changes belong in the
  mock-`omp` fixture (`test/fixtures/mock-omp.mjs`); UI changes get a jsdom test.

## Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-session model override
fix: stop double-firing new-session on macOS menu accelerators
docs: document the RUN_E2E provider requirement
chore: bump electron to 43.3
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`.
Keep the subject imperative and under ~72 characters; put the "why" in the body.

## Pull requests

1. Branch off `main` (e.g. `feat/model-override`, `fix/menu-double-fire`).
2. Make the change, add tests, and get `typecheck` + `test` + `build` green.
3. Open a PR against `main` and fill out the template. Link any issue it closes.
4. Keep PRs focused — one logical change per PR is much easier to review.

## Releases

Releases are cut by CI, not locally: push a `v*` tag and
[`release.yml`](.github/workflows/release.yml) builds on macOS and Windows runners
and uploads the artifacts plus the auto-updater feeds. Local `dist:*` builds always
pass `--publish never`.
