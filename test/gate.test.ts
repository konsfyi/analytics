import { afterEach, describe, expect, it } from "vitest";
import { createAnalytics, type Options } from "../src/server/index.js";

// Who may read the numbers. The part worth testing is that a site which has
// not said the numbers are public gets the opposite, including the awkward case
// of a private dashboard with no token set.

const of = (headers: Record<string, string> = {}) => (name: string) =>
  headers[name] ?? null;

const may = (options: Options, headers: Record<string, string> = {}, token?: string) =>
  createAnalytics(options).mayRead(of(headers), token);

afterEach(() => {
  delete process.env.ANALYTICS_PUBLIC;
  delete process.env.ANALYTICS_TOKEN;
});

describe("mayRead", () => {
  it("is private unless the site says otherwise", () => {
    expect(may({})).toBe(false);
    expect(may({}, {}, "anything")).toBe(false);
  });

  it("lets anyone in when the numbers are public", () => {
    expect(may({ public: true })).toBe(true);
  });

  it("takes public from the environment when no option says", () => {
    process.env.ANALYTICS_PUBLIC = "true";
    expect(may({})).toBe(true);
    // an option in code wins over the environment
    expect(may({ public: false })).toBe(false);
  });

  it("lets nobody in when it is private and there is nothing to check", () => {
    // The failure that matters: private with no token must be nobody, never
    // everybody.
    expect(may({ public: false, token: "" }, {}, "")).toBe(false);
  });

  it("takes the token as a header or in the URL", () => {
    const token = "a-shared-secret";
    expect(may({ token }, { authorization: "Bearer a-shared-secret" })).toBe(true);
    expect(may({ token }, { authorization: "bearer a-shared-secret" })).toBe(true);
    expect(may({ token }, { "x-analytics-token": "a-shared-secret" })).toBe(true);
    expect(may({ token }, {}, "a-shared-secret")).toBe(true);
    process.env.ANALYTICS_TOKEN = token;
    expect(may({}, {}, "a-shared-secret")).toBe(true);
  });

  it("refuses a wrong token, an empty one, and a near miss", () => {
    const token = "a-shared-secret";
    expect(may({ token }, {}, "")).toBe(false);
    expect(may({ token }, {}, "a-shared-secre")).toBe(false);
    expect(may({ token }, {}, "a-shared-secret ")).toBe(false);
    expect(may({ token }, { authorization: "Bearer wrong" })).toBe(false);
  });
});

describe("report", () => {
  const ask = (options: Options, url: string, headers: Record<string, string> = {}) =>
    createAnalytics(options).report(new Request(url, { headers }));

  it("serves the numbers when they are public", async () => {
    const res = await ask({ public: true }, "https://example.com/api/analytics");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { views: number } };
    expect(typeof body.summary.views).toBe("number");
  });

  it("is a 404 rather than a 401 when it is private", async () => {
    // Saying "wrong password" is saying there is a password.
    expect((await ask({ token: "shh" }, "https://example.com/api/analytics")).status).toBe(404);
    expect(
      (await ask({ token: "shh" }, "https://example.com/api/analytics?token=shh")).status,
    ).toBe(200);
  });

  it("reads the window out of the URL", async () => {
    const day = await (await ask({ public: true }, "https://e.com/api/analytics")).json();
    const month = await (await ask({ public: true }, "https://e.com/api/analytics?month")).json();
    expect(month.from).toBeLessThan(day.from);
  });
});
