#!/usr/bin/env node
// Hits the deployed API's health route and asserts a healthy response.
// Used by the nightly workflow; exits non-zero on any failure.

const API_URL = process.env.VITE_API_URL;
const TIMEOUT_MS = 10_000;

async function main() {
  if (!API_URL) fail("VITE_API_URL is not set");
  const url = new URL("/api/health", API_URL).href;

  const start = Date.now();
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    fail(`Request failed: ${err.message}`);
  }
  const elapsed = Date.now() - start;

  if (!res.ok) fail(`HTTP ${res.status} ${res.statusText} (in ${elapsed} ms)`);

  const body = await res.json().catch(() => null);
  if (body?.ok !== true) fail(`Unexpected body: ${JSON.stringify(body)}`);

  console.log(`OK ${url} → ${res.status} (env: ${body.env}) in ${elapsed} ms`);
}

function fail(msg) {
  console.error(`HEALTH CHECK FAILED: ${msg}`);
  process.exit(1);
}

main();
