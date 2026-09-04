/**
 * Field-model lint.
 *
 * `enablingConditions` are ANDed - GTM has no OR - so every new `call` value
 * means revisiting every visibility chain. These tests keep the form model and
 * the code from drifting apart, and pin the additive-only guarantee: every
 * field name that shipped in 2022 is still bound to the same meaning.
 */

const { getSandboxedCode, getTemplateParameters, getInfo } = require('./helpers/tpl');
const {
  findHandledCalls,
  collectParamNames,
  collectEnablingConditions,
  findParam,
} = require('./helpers/static-analysis');

// Field names that customers already have live tags bound to. Renaming or
// removing any of these breaks their containers on update.
const LEGACY_FIELDS = [
  'call',
  'useObjectAction',
  'userId',
  'event',
  'object',
  'action',
  'defaultProperties',
  'customProperties',
  'suppressGa',
];

const LEGACY_CALLS = ['track', 'page', 'identify', 'group'];

// packages/analytics-js/src/components/userSessionManager/constants.ts
const DEFAULT_RESET_OPTIONS = {
  resetUserId: true,
  resetUserTraits: true,
  resetGroupId: true,
  resetGroupTraits: true,
  resetSessionInfo: true,
  resetAuthToken: true,
  resetAnonymousId: false,
  resetInitialReferrer: false,
  resetInitialReferringDomain: false,
};

describe('field model', () => {
  const params = getTemplateParameters();
  const code = getSandboxedCode();
  const names = collectParamNames(params);
  const callParam = findParam(params, 'call');
  const callValues = callParam.selectItems.map(item => item.value);

  test('every legacy field name survives', () => {
    LEGACY_FIELDS.forEach(name => {
      expect(names.has(name)).toBe(true);
    });
  });

  test('every legacy call value survives', () => {
    LEGACY_CALLS.forEach(value => {
      expect(callValues).toContain(value);
    });
  });

  test('call values are unique', () => {
    expect(new Set(callValues).size).toBe(callValues.length);
  });

  test('every call dropdown value has a code branch', () => {
    const handled = findHandledCalls(code);
    const dead = callValues.filter(value => !handled.has(value));
    expect(dead).toEqual([]);
  });

  test('every code branch has a call dropdown value', () => {
    const orphans = [...findHandledCalls(code)].filter(value => !callValues.includes(value));
    expect(orphans).toEqual([]);
  });

  test('every enablingConditions chain references a field that exists', () => {
    const broken = collectEnablingConditions(params)
      .filter(entry => !names.has(entry.condition.paramName))
      .map(entry => `${entry.owner} -> ${entry.condition.paramName}`);
    expect(broken).toEqual([]);
  });

  test('every enablingConditions chain on `call` uses a real call value', () => {
    const broken = collectEnablingConditions(params)
      .filter(entry => entry.condition.paramName === 'call')
      .filter(entry => !callValues.includes(entry.condition.paramValue))
      .map(entry => `${entry.owner} -> ${entry.condition.paramValue}`);
    expect(broken).toEqual([]);
  });

  test('every field has a name and a type', () => {
    const walk = list => {
      list.forEach(param => {
        expect(typeof param.type).toBe('string');
        expect(typeof param.name).toBe('string');
        expect(param.name.length).toBeGreaterThan(0);
        if (param.subParams) {
          walk(param.subParams);
        }
      });
    };
    walk(params);
  });

  test('field names are unique across the whole model', () => {
    const seen = [];
    const walk = list => {
      list.forEach(param => {
        seen.push(param.name);
        if (param.subParams) {
          walk(param.subParams);
        }
      });
    };
    walk(params);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('reset checkboxes default to the SDK DEFAULT_RESET_OPTIONS', () => {
    Object.keys(DEFAULT_RESET_OPTIONS).forEach(name => {
      const param = findParam(params, name);
      expect(param).toBeDefined();
      expect(param.type).toBe('CHECKBOX');
      expect(Boolean(param.defaultValue)).toBe(DEFAULT_RESET_OPTIONS[name]);
    });
  });

  test('the suppressGa field is relabelled as deprecated', () => {
    const param = findParam(params, 'suppressGa');
    expect(`${param.displayName} ${param.help}`.toLowerCase()).toContain('deprecated');
  });

  test('the template is named RudderStack', () => {
    expect(getInfo().displayName).toBe('RudderStack');
  });

  test('the template stays a WEB tag template', () => {
    const info = getInfo();
    expect(info.type).toBe('TAG');
    expect(info.containerContexts).toEqual(['WEB']);
  });
});
