# analytics — agent notes

A public repository: everything committed here is visible to anyone. Code,
docs and examples only — no notes, plans, client material or anything private.
Plans and working notes live outside this repo.

- One branch, `main`, protected. Releases are version tags and npm publishes
  of `@konsfyi/analytics`.
- `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` must pass
  before a push.
- Browser code (`src/client`, `src/dashboard`, `src/next`) never reads
  `process` or imports a Node built-in; `test/browser-safe.test.ts` enforces it.
- Relative imports carry `.js` extensions (NodeNext), so the build runs in
  plain Node as well as under a bundler.
- The dashboard is plain CSS on `--an-*` custom properties: no framework
  classes, no font loaded, rem everywhere except hairlines and shadows.
- `temp/` is scratch and gitignored.
