<!-- Keep the title in Conventional Commits form, e.g. "fix: stop double-firing new-session on macOS". -->

## What & why

<!-- What does this change, and what problem does it solve? Link any issue: "Closes #123". -->

## How it was verified

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Tried it in the running app (`npm run dev`) where relevant
- [ ] `RUN_E2E=1 npm test` (only if the change touches the RPC protocol)

## Notes for reviewers

<!--
Anything worth flagging: a new main-process dependency (did you externalize it in
electron.vite.config.ts?), a protocol change (is the mock-omp fixture updated?),
a UI change (screenshot?), or a deliberate scope limit.
-->
