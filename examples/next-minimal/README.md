# next-minimal

The smallest Next site with `@konsfyi/analytics` in it: a home page and an about page that
get counted, and the dashboard at `/analytics`.

```sh
npm install
npm run dev
```

Open `http://localhost:3000/?analytics=on` once. localhost isn't counted
unless a browser is switched on. Click around, then open `/analytics`.

With nothing configured, hits go to `.analytics/analytics.jsonl`. Set
`DATABASE_URL` to use Postgres. The dashboard is public here
(`public: true` in `lib/analytics.ts`); remove that line and set
`ANALYTICS_TOKEN` to make it private.
