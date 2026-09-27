import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Read before anything else the tests import. Two jobs, and the first is the
// important one: make it impossible for a test run to reach a real database.
// Everything here writes to a scratch directory that goes away with the
// machine's temp.

delete process.env.DATABASE_URL;
delete process.env.ANALYTICS_DATABASE_URL;
delete process.env.ANALYTICS_PUBLIC;
delete process.env.ANALYTICS_TOKEN;
delete process.env.ANALYTICS_SITE;

process.env.ANALYTICS_DIR = mkdtempSync(join(tmpdir(), "analytics-test-"));
process.env.ANALYTICS_SALT = "a salt for the tests";
process.env.ANALYTICS_TRUST_PROXY = "1";
