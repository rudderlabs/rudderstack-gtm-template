#!/usr/bin/env node
// Generates a GTM container export that wires up every call the template
// supports, pointing at the buttons on gtm-template-test-page.html.
//
//   node gtm-container-generator.mjs <WRITE_KEY> <DATA_PLANE_URL> [template.tpl]
//
// Import the result in GTM: Admin > Import Container > choose a new workspace
// and "Merge / Rename conflicting". The custom template travels with it, so
// there is nothing to import separately.

import { readFileSync, writeFileSync } from 'node:fs';

const [writeKey = '', dataPlaneUrl = '', tplPath = 'template.tpl'] =
  process.argv.slice(2);

const templateData = readFileSync(tplPath, 'utf8');

const ACCOUNT = '0';
const CONTAINER = '0';
const TEMPLATE_ID = '1';
const TAG_TYPE = `cvt_${CONTAINER}_${TEMPLATE_ID}`;

const base = { accountId: ACCOUNT, containerId: CONTAINER, fingerprint: '0' };
const tpl = (key, value) => ({ type: 'TEMPLATE', key, value });
const bool = (key, value) => ({ type: 'BOOLEAN', key, value: String(value) });

let triggerSeq = 100;
const triggers = [];

const initTrigger = () => {
  const t = { ...base, triggerId: String(++triggerSeq), name: 'Initialization - All Pages', type: 'INIT' };
  triggers.push(t);
  return t.triggerId;
};
const pageviewTrigger = () => {
  const t = { ...base, triggerId: String(++triggerSeq), name: 'All Pages', type: 'PAGEVIEW' };
  triggers.push(t);
  return t.triggerId;
};
const clickTrigger = elementId => {
  const t = {
    ...base,
    triggerId: String(++triggerSeq),
    name: `Click - ${elementId}`,
    type: 'CLICK',
    filter: [
      {
        type: 'EQUALS',
        parameter: [tpl('arg0', '{{Click ID}}'), tpl('arg1', elementId)],
      },
    ],
  };
  triggers.push(t);
  return t.triggerId;
};

// Object-returning variables, since the template's JSON fields need real objects.
const variables = [
  ['RS - Default Properties', 'function(){return {page_location: document.location.href, page_title: document.title};}'],
    // Deliberately not 'app' -- that is a standard SDK context field, and
  // shadowing it makes it impossible to tell a custom value from the default.
  ['RS - Custom Context', "function(){return {testHarness: 'gtm-template-test'};}"],
  ['RS - Consent Options', 'function(){return {consentManagement: {enabled: true}};}'],
  ['RS - Event Options', "function(){return {integrations: {All: true}};}"],
].map(([name, javascript], i) => ({
  ...base,
  variableId: String(i + 1),
  name,
  type: 'jsm',
  parameter: [tpl('javascript', javascript)],
}));

const ON = initTrigger();
const ALL_PAGES = pageviewTrigger();

// One tag per call. Everything a call needs is filled in, so the container is
// clickable the moment it is imported.
const specs = [
  ['load', ON, [tpl('call', 'load'), tpl('writeKey', writeKey), tpl('dataPlaneUrl', dataPlaneUrl)]],
  ['page', ALL_PAGES, [tpl('call', 'page'), tpl('defaultProperties', '{{RS - Default Properties}}')]],
  ['page (named)', clickTrigger('btn-page'), [
    tpl('call', 'page'), tpl('category', 'Docs'), tpl('name', 'Test Page'),
    tpl('defaultProperties', '{{RS - Default Properties}}')]],
  ['track', clickTrigger('btn-track'), [
    tpl('call', 'track'), tpl('event', 'test_track'),
    tpl('defaultProperties', '{{RS - Default Properties}}'),
    tpl('eventOptions', '{{RS - Event Options}}'),
    { type: 'LIST', key: 'customProperties', list: [
      { type: 'MAP', map: [tpl('key', 'source'), tpl('value', 'gtm-test')] }] }]],
  ['track (object action)', clickTrigger('btn-track-oa'), [
    tpl('call', 'track'), bool('useObjectAction', true),
    tpl('object', 'Order'), tpl('action', 'Completed')]],
  ['identify', clickTrigger('btn-identify'), [
    tpl('call', 'identify'), tpl('userId', 'test-user-1'),
    { type: 'LIST', key: 'customProperties', list: [
      { type: 'MAP', map: [tpl('key', 'plan'), tpl('value', 'pro')] }] }]],
  ['group', clickTrigger('btn-group'), [
    tpl('call', 'group'), tpl('groupId', 'test-group-1'),
    { type: 'LIST', key: 'customProperties', list: [
      { type: 'MAP', map: [tpl('key', 'tier'), tpl('value', 'enterprise')] }] }]],
  ['alias', clickTrigger('btn-alias'), [
    tpl('call', 'alias'), tpl('to', 'test-user-2'), tpl('from', 'test-user-1')]],
  ['reset', clickTrigger('btn-reset'), [
    tpl('call', 'reset'),
    bool('resetUserId', true), bool('resetUserTraits', true),
    bool('resetGroupId', true), bool('resetGroupTraits', true),
    bool('resetSessionInfo', true), bool('resetAuthToken', true),
    bool('resetAnonymousId', false), bool('resetInitialReferrer', false),
    bool('resetInitialReferringDomain', false)]],
  ['setAnonymousId', clickTrigger('btn-set-anonymous-id'), [
    tpl('call', 'setAnonymousId'), tpl('anonymousId', 'test-anon-1')]],
  ['startSession', clickTrigger('btn-start-session'), [
    tpl('call', 'startSession'), tpl('sessionId', '1788500000000')]],
  ['endSession', clickTrigger('btn-end-session'), [tpl('call', 'endSession')]],
  ['setCustomContext', clickTrigger('btn-set-custom-context'), [
    tpl('call', 'setCustomContext'), tpl('customContext', '{{RS - Custom Context}}')]],
  ['clearCustomContext', clickTrigger('btn-clear-custom-context'), [tpl('call', 'clearCustomContext')]],
  ['setAuthToken', clickTrigger('btn-set-auth-token'), [
    tpl('call', 'setAuthToken'), tpl('authToken', 'test-auth-token')]],
  ['consent', clickTrigger('btn-consent'), [
    tpl('call', 'consent'), tpl('consentOptions', '{{RS - Consent Options}}')]],
];

const tags = specs.map(([name, triggerId, parameter], i) => ({
  ...base,
  tagId: String(i + 1),
  name: `RudderStack - ${name}`,
  type: TAG_TYPE,
  parameter,
  firingTriggerId: [triggerId],
  tagFiringOption: 'ONCE_PER_EVENT',
  monitoringMetadata: { type: 'MAP' },
}));

const container = {
  exportFormatVersion: 2,
  exportTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
  containerVersion: {
    path: `accounts/${ACCOUNT}/containers/${CONTAINER}/versions/0`,
    ...base,
    containerVersionId: '0',
    name: 'RudderStack template test',
    description: 'Every call the RudderStack GTM template supports, wired to gtm-template-test-page.html',
    container: {
      path: `accounts/${ACCOUNT}/containers/${CONTAINER}`,
      ...base,
      name: 'RudderStack template test',
      publicId: 'GTM-XXXXXXX',
      usageContext: ['WEB'],
    },
    // Click ID has to be on or every click trigger silently never fires.
    builtInVariable: ['CLICK_ID', 'CLICK_ELEMENT', 'CLICK_CLASSES', 'CLICK_TEXT', 'EVENT'].map(type => ({
      ...base,
      type,
      name: type
        .toLowerCase()
        .split('_')
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' '),
    })),
    variable: variables,
    trigger: triggers,
    tag: tags,
    customTemplate: [
      { ...base, templateId: TEMPLATE_ID, name: 'RudderStack', templateData },
    ],
  },
};

const out = 'e2e/container-export.json';
writeFileSync(out, `${JSON.stringify(container, null, 2)}\n`);

console.log(`${out}: ${tags.length} tags, ${triggers.length} triggers, ${variables.length} variables`);
if (!writeKey || !dataPlaneUrl) {
  console.log('NOTE: write key / data plane URL are empty - fill them in on the load tag after import.');
}
