import { createAnalytics } from "@konsfyi/analytics/server";

export const analytics = createAnalytics({
  site: "example.com",
  // An example should show its numbers; a real site decides for itself.
  public: true,
});
