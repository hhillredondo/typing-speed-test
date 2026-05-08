#!/usr/bin/env node
// Hits the deployed SPA and asserts a healthy response.
// Used by the nightly workflow; exits non-zero on any failure.

const URL = process.env.HEALTH_CHECK_URL || "https://d1cm3vgninwgq8.cloudfront.net/home";
const EXPECTED_TITLE = /typing\s*speed/i;
const TIMEOUT_MS = 10_000;

async function main() {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(URL, { signal: controller.signal, redirect: "follow" });
  } catch (err) {
    fail(`Request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const elapsed = Date.now() - start;

  if (!res.ok) fail(`HTTP ${res.status} ${res.statusText} (in ${elapsed} ms)`);

  const body = await res.text();
  if (!EXPECTED_TITLE.test(body)) {
    fail(`Response did not contain expected title (got ${body.length} bytes)`);
  }

  console.log(`OK ${URL} → ${res.status} in ${elapsed} ms`);
}

function fail(msg) {
  console.error(`HEALTH CHECK FAILED: ${msg}`);
  process.exit(1);
}

main();
