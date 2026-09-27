## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm test`, `npm run typecheck` and `npm run lint` pass
- [ ] A change to `src/parse.ts` comes with the real user-agent or referrer in `test/parse.test.ts`
- [ ] Nothing under `src/client`, `src/dashboard` or `src/next` reads `process` or imports a Node built-in
- [ ] It keeps to what the package will stay (see CONTRIBUTING.md): no cookies, no identity across days, no new runtime dependency
