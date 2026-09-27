# Contributing

Thanks for looking. This package is small on purpose, and most of this page is about
keeping it that way.

## How changes get in

Fork the repo, make your change on a branch, and open a pull request against
`main`. Nobody but the maintainer can write to this repository, and every pull
request is reviewed before it's merged. CI (typecheck, lint, tests) has to
pass. For a first-time contributor, CI runs once a maintainer approves it.

A pull request may sit for a while. That's a question of time, not a verdict.

For anything larger than a fix, open an issue first so we can agree on the
shape before you write it.

## What the package will stay

These aren't up for a pull request:

- **No cookies**, and nothing else that identifies a browser beyond the tab.
- **No identity across days.** The visitor id includes the date. A feature
  that needs to recognise a returning visitor doesn't fit here.
- **No runtime dependencies of consequence.** React, Next and `pg` are
  optional peers. A new dependency needs a very good reason.
- **One endpoint and one dashboard.** New figures are welcome if they're worth
  their space. A second product isn't.
- **Aggregation in one place.** Every store returns rows and `summarize()`
  does the arithmetic. A store that aggregates in SQL would mean two
  implementations to keep in step.

## What makes a change easy to merge

- **Regex changes come with a test.** The user-agent and referrer lists in
  `src/parse.ts` are where most contributions land, and a wrong one fails
  quietly: traffic just starts reading as "Other". Add the real user-agent
  string to `test/parse.test.ts`.
- **Browser code stays browser-safe.** Nothing under `src/client`,
  `src/dashboard` or `src/next` may read `process` or import a Node built-in.
  `test/browser-safe.test.ts` checks this.
- **A new store passes the store contract** in `test/store.test.ts`.
- **The dashboard keeps its own styling.** Plain CSS on the `--an-*` custom
  properties, no framework classes, and motion that respects
  `prefers-reduced-motion`.
- Small commits with plain messages.

## Running it

```sh
npm install
npm test           # vitest, no network, no database
npm run typecheck
npm run lint
npm run build
```

`npm test` also writes `temp/dashboard.html`: the dashboard rendered on its
own with invented data, so you can open it and see a change.

## Code of conduct

Participation is covered by the [code of conduct](CODE_OF_CONDUCT.md).
