/**
 * Structural checks on template.tpl itself - a `.tpl` that GTM cannot import is
 * a failure no behavioural test would catch.
 */

const { readTemplate } = require('./helpers/tpl');

const REQUIRED_SECTIONS = [
  'TERMS_OF_SERVICE',
  'INFO',
  'TEMPLATE_PARAMETERS',
  'SANDBOXED_JS_FOR_WEB_TEMPLATE',
  'WEB_PERMISSIONS',
  'TESTS',
  'NOTES',
];

describe('template.tpl', () => {
  const { source, sections, order } = readTemplate();

  test('carries every section GTM expects, in order', () => {
    expect(order).toEqual(REQUIRED_SECTIONS);
  });

  test('every section has content', () => {
    REQUIRED_SECTIONS.forEach(name => {
      expect(sections[name].length).toBeGreaterThan(0);
    });
  });

  test('the JSON sections parse', () => {
    ['INFO', 'TEMPLATE_PARAMETERS', 'WEB_PERMISSIONS'].forEach(name => {
      expect(() => JSON.parse(sections[name])).not.toThrow();
    });
  });

  test('the ___TESTS___ block still holds scenarios for the GTM editor', () => {
    expect(sections.TESTS).toMatch(/^scenarios:/);
    expect(sections.TESTS.match(/^- name:/gm).length).toBeGreaterThan(1);
  });

  test('the file is ASCII apart from the base64 brand thumbnail', () => {
    const offenders = source
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(entry => entry.number > 1 && entry.line.indexOf('"thumbnail"') === -1)
      // eslint-disable-next-line no-control-regex
      .filter(entry => /[^\x00-\x7F]/.test(entry.line))
      .map(entry => entry.number);
    expect(offenders).toEqual([]);
  });
});
