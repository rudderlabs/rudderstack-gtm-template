#!/usr/bin/env node
// Drives every call the template supports against a real GTM container and a
// real data plane, then reports what actually happened.
//
//   node e2e/validate.mjs <GTM-CONTAINER-ID> [page-url]
//
// Serve the page first:  npm run e2e:serve
//
// Assertions are on behaviour, not on the fixture's values, so this works
// against any container whose tags are wired to the buttons on test-page.html
// -- including one configured by hand.
//
// Event calls are asserted on the request payload. State calls send nothing by
// design and are asserted on SDK state instead; conflating the two makes a
// working call look broken. A button with no tag behind it is reported SKIP,
// because "nothing arrived" cannot distinguish an unwired button from a broken
// one -- only a wrong payload proves a bug.

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const [containerId, pageUrl = 'http://localhost:8000/test-page.html'] = process.argv.slice(2);
if (!containerId) {
  console.error('usage: node e2e/validate.mjs <GTM-CONTAINER-ID> [page-url]');
  process.exit(2);
}

// puppeteer-core ships no browser, so the executable has to be found. Failing
// here with the reason beats puppeteer's ENOENT from deep inside launch().
const CHROME_BY_PLATFORM = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};
const CHROME = process.env.CHROME_PATH || CHROME_BY_PLATFORM[process.platform];
if (!CHROME || !existsSync(CHROME)) {
  console.error(
    `Chrome not found${CHROME ? ` at ${CHROME}` : ` for platform ${process.platform}`}.\n` +
      'Set CHROME_PATH to a Chrome or Chromium executable.',
  );
  process.exit(2);
}

const results = [];
const record = (status, label, detail) => {
  results.push({ status, label });
  console.log(`${status.padEnd(4)}  ${label.padEnd(44)} ${detail}`);
};
const check = (label, pass, detail) => record(pass ? 'PASS' : 'FAIL', label, detail);
const skip = (label, detail) => record('SKIP', label, detail);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });

// Matched on the path and the payload shape rather than the host, so a custom
// data plane domain is captured too.
const EVENT_PATH = /\/v1\/(page|track|identify|group|alias|batch)(\?|$)/;

let captured = [];
page.on('request', request => {
  const url = request.url();
  if (!EVENT_PATH.test(url) || request.method() !== 'POST') return;
  let body = {};
  try {
    body = JSON.parse(request.postData() || '{}');
  } catch {
    body = {};
  }
  (body.batch || [body]).filter(event => event && event.type).forEach(event => captured.push(event));
});

const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error).slice(0, 160)));

await page.goto(`${pageUrl}?gtm=${containerId}`, { waitUntil: 'networkidle2', timeout: 60000 });

const loaded = await page
  .waitForFunction(() => window.rudderanalytics && !Array.isArray(window.rudderanalytics), {
    timeout: 30000,
  })
  .then(() => true)
  .catch(() => false);
check('the load tag installs the SDK', loaded, loaded ? 'window.rudderanalytics is live' : 'never left the buffer');
if (!loaded) {
  await browser.close();
  process.exit(1);
}
await new Promise(resolve => setTimeout(resolve, 2500));

check(
  'a page call fires on load',
  captured.some(event => event.type === 'page'),
  `${captured.filter(event => event.type === 'page').length} page event(s)`,
);

const click = async id => {
  captured = [];
  await page.evaluate(target => document.getElementById(target).scrollIntoView({ block: 'center' }), id);
  await page.click(`#${id}`);
  await new Promise(resolve => setTimeout(resolve, 1600));
  return captured;
};
const state = () =>
  page.evaluate(() => {
    const sdk = window.rudderanalytics;
    return {
      anonymousId: (sdk.getAnonymousId && sdk.getAnonymousId()) || null,
      userId: (sdk.getUserId && sdk.getUserId()) || null,
      sessionId: (sdk.getSessionId && sdk.getSessionId()) || null,
    };
  });

// --- event calls: the payload has to be well formed for its type ----------
const eventChecks = [
  ['btn-page', 'page', 'page sends a well formed event',
    event => Boolean(event.properties),
    event => `name=${event.name || '(unset)'} category=${event.category || '(unset)'}`],
  ['btn-track', 'track', 'track sends an event name and properties',
    event => Boolean(event.event) && Boolean(event.properties),
    event => `event=${event.event} props=[${Object.keys(event.properties).join(',')}]`],
  ['btn-track-oa', 'track', 'object action builds a two part event name',
    event => Boolean(event.event) && event.event.includes(' ') &&
      Boolean(event.properties.object) && Boolean(event.properties.action),
    event => `event=${event.event}`],
  ['btn-identify', 'identify', 'identify sends a user id',
    event => Boolean(event.userId),
    event => `userId=${event.userId}`],
  ['btn-group', 'group', 'group sends a group id',
    event => Boolean(event.groupId),
    event => `groupId=${event.groupId}`],
  ['btn-alias', 'alias', 'alias sends both identifiers',
    event => Boolean(event.userId) && Boolean(event.previousId),
    event => `userId=${event.userId} previousId=${event.previousId}`],
];

for (const [id, type, label, predicate, describe] of eventChecks) {
  const events = await click(id);
  const ofType = events.filter(event => event.type === type);
  if (!ofType.length) {
    skip(label, `no ${type} event arrived - is a tag wired to #${id}?`);
    continue;
  }
  const match = ofType.find(predicate);
  check(label, Boolean(match), match ? describe(match) : `${type} event arrived but malformed`);
}

// --- state calls: compare state before and after --------------------------
const before = await state();
await click('btn-set-anonymous-id');
let current = await state();
check('setAnonymousId changes the anonymous id',
  Boolean(current.anonymousId) && current.anonymousId !== before.anonymousId,
  `${before.anonymousId} -> ${current.anonymousId}`);

await click('btn-start-session');
const started = await state();
check('startSession produces a session id', Boolean(started.sessionId), `sessionId=${started.sessionId}`);

await click('btn-end-session');
current = await state();
check('endSession clears the session', !current.sessionId, `sessionId=${current.sessionId}`);

await click('btn-identify');
const identified = await state();

await click('btn-set-custom-context');
let events = await click('btn-track');
const withContext = events.find(event => event.context);
// context.app and friends are always present; look for a key the SDK does not set
const SDK_CONTEXT_KEYS = new Set([
  'app', 'library', 'userAgent', 'os', 'locale', 'screen', 'campaign', 'page',
  'traits', 'sessionId', 'sessionStart', 'timezone', 'consentManagement', 'userAgentDataAvailable',
]);
const customKeys = withContext
  ? Object.keys(withContext.context).filter(key => !SDK_CONTEXT_KEYS.has(key))
  : [];
if (!withContext) {
  skip('setCustomContext reaches the payload', 'no track event to inspect');
} else {
  check('setCustomContext reaches the payload', customKeys.length > 0,
    customKeys.length ? `custom keys=[${customKeys.join(',')}]` : 'no non-SDK keys in context');
}

await click('btn-clear-custom-context');
events = await click('btn-track');
const after = events.find(event => event.context);
if (!after || !customKeys.length) {
  skip('clearCustomContext removes it', 'nothing was set to clear');
} else {
  const remaining = Object.keys(after.context).filter(key => customKeys.includes(key));
  check('clearCustomContext removes it', remaining.length === 0,
    remaining.length ? `still present: ${remaining.join(',')}` : 'gone from context');
}

await click('btn-reset');
current = await state();
if (!identified.userId) {
  skip('reset clears the user', 'no user was identified to clear');
} else {
  check('reset clears the user', !current.userId, `${identified.userId} -> ${current.userId}`);
}
check('reset keeps the anonymous id (SDK default)',
  Boolean(current.anonymousId) && current.anonymousId === identified.anonymousId,
  `anonymousId=${current.anonymousId}`);

// setAuthToken and consent have no client-observable effect, so they are
// exercised but not asserted; a failure would surface as a page error.
await click('btn-set-auth-token');
await click('btn-consent');
check('setAuthToken and consent run without error', pageErrors.length === 0,
  pageErrors.length ? pageErrors.join(' | ') : 'no page errors (effect not observable here)');

await browser.close();

const failed = results.filter(result => result.status === 'FAIL');
const skipped = results.filter(result => result.status === 'SKIP');
console.log(
  `\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`,
);
if (skipped.length) console.log('SKIP means no tag was wired to that button in this container.');
if (failed.length) {
  console.log(
    'A failing state call (setAnonymousId, startSession, endSession, reset,\n' +
      'setCustomContext) is only conclusive against a container built by\n' +
      'generate-container.mjs. These calls send no request, so an unwired button\n' +
      'and a broken call look identical from here.',
  );
}
process.exit(failed.length ? 1 : 0);
