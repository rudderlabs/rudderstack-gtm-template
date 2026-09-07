/**
 * Overload selection - design doc s7.1.
 *
 * v3 resolves overloads by inspecting argument *types* at runtime
 * (`pageArgumentsToCallOptions` treats the first object literal it sees as
 * `properties`), so a leading `undefined` silently shifts every later argument
 * into the wrong slot. The template must therefore pick the exact declared
 * overload for each filled-field combination and truncate trailing empties.
 *
 * Every assertion below checks the exact argument list, arity included.
 */

const { runTemplate, loadedSdkWindow } = require('./helpers/sandbox');

const args = data => {
  const result = runTemplate(data, { window: loadedSdkWindow() });
  expect(result.gtmOnFailure).not.toHaveBeenCalled();
  expect(result.callInWindow).toHaveLength(1);
  return result.callInWindow[0].args;
};

const OPTIONS = { anonymousId: 'anon-1' };

describe('page overloads', () => {
  test('category + name -> page(category, name, properties)', () => {
    expect(args({ call: 'page', category: 'Docs', name: 'Home' })).toEqual([
      'Docs',
      'Home',
      {},
    ]);
  });

  test('category + name + options -> page(category, name, properties, options)', () => {
    expect(
      args({ call: 'page', category: 'Docs', name: 'Home', eventOptions: OPTIONS }),
    ).toEqual(['Docs', 'Home', {}, OPTIONS]);
  });

  test('name only -> page(name, properties)', () => {
    expect(args({ call: 'page', name: 'Home' })).toEqual(['Home', {}]);
  });

  test('name only + options -> page(name, properties, options)', () => {
    expect(args({ call: 'page', name: 'Home', eventOptions: OPTIONS })).toEqual([
      'Home',
      {},
      OPTIONS,
    ]);
  });

  test('neither -> page(properties)', () => {
    expect(args({ call: 'page' })).toEqual([{}]);
  });

  test('neither + options -> page(properties, options)', () => {
    expect(args({ call: 'page', eventOptions: OPTIONS })).toEqual([{}, OPTIONS]);
  });

  test('empty strings count as unset, not as a leading undefined', () => {
    expect(args({ call: 'page', category: '', name: '' })).toEqual([{}]);
  });

  // The SDK has no overload that accepts a category without a name: a lone
  // string argument is reinterpreted as the page name. Folding it into the
  // properties is where `pageArgumentsToCallOptions` puts it anyway.
  test('category without a name is folded into properties', () => {
    expect(args({ call: 'page', category: 'Docs' })).toEqual([{ category: 'Docs' }]);
  });
});

describe('track overloads', () => {
  test('event -> track(event, properties)', () => {
    expect(args({ call: 'track', event: 'Clicked' })).toEqual(['Clicked', {}]);
  });

  test('event + options -> track(event, properties, options)', () => {
    expect(args({ call: 'track', event: 'Clicked', eventOptions: OPTIONS })).toEqual([
      'Clicked',
      {},
      OPTIONS,
    ]);
  });
});

describe('identify overloads', () => {
  test('userId set -> identify(userId, traits)', () => {
    expect(args({ call: 'identify', userId: 'u1' })).toEqual(['u1', {}]);
  });

  test('userId set + options -> identify(userId, traits, options)', () => {
    expect(args({ call: 'identify', userId: 'u1', eventOptions: OPTIONS })).toEqual([
      'u1',
      {},
      OPTIONS,
    ]);
  });

  test('userId empty -> identify(traits)', () => {
    expect(
      args({ call: 'identify', customProperties: [{ key: 'email', value: 'a@b.com' }] }),
    ).toEqual([{ email: 'a@b.com' }]);
  });

  test('userId empty + options -> identify(traits, options)', () => {
    expect(args({ call: 'identify', userId: '', eventOptions: OPTIONS })).toEqual([
      {},
      OPTIONS,
    ]);
  });
});

describe('group overloads', () => {
  test('groupId set -> group(groupId, traits)', () => {
    expect(args({ call: 'group', groupId: 'g1' })).toEqual(['g1', {}]);
  });

  test('groupId set + options -> group(groupId, traits, options)', () => {
    expect(args({ call: 'group', groupId: 'g1', eventOptions: OPTIONS })).toEqual([
      'g1',
      {},
      OPTIONS,
    ]);
  });

  test('groupId empty -> group(traits)', () => {
    expect(args({ call: 'group', customProperties: [{ key: 'plan', value: 'pro' }] })).toEqual(
      [{ plan: 'pro' }],
    );
  });

  test('groupId empty + options -> group(traits, options)', () => {
    expect(args({ call: 'group', groupId: '', eventOptions: OPTIONS })).toEqual([{}, OPTIONS]);
  });
});

describe('alias overloads', () => {
  test('from set -> alias(to, from)', () => {
    expect(args({ call: 'alias', to: 'new', from: 'old' })).toEqual(['new', 'old']);
  });

  test('from set + options -> alias(to, from, options)', () => {
    expect(args({ call: 'alias', to: 'new', from: 'old', eventOptions: OPTIONS })).toEqual([
      'new',
      'old',
      OPTIONS,
    ]);
  });

  test('from empty -> alias(to)', () => {
    expect(args({ call: 'alias', to: 'new', from: '' })).toEqual(['new']);
  });

  test('from empty + options -> alias(to, options)', () => {
    expect(args({ call: 'alias', to: 'new', eventOptions: OPTIONS })).toEqual([
      'new',
      OPTIONS,
    ]);
  });
});

describe('trailing empties are truncated, never passed as undefined', () => {
  const cases = [
    { call: 'page' },
    { call: 'track', event: 'Clicked' },
    { call: 'identify', userId: 'u1' },
    { call: 'group', groupId: 'g1' },
    { call: 'alias', to: 'new' },
    { call: 'reset' },
    { call: 'consent' },
    { call: 'startSession' },
    { call: 'endSession' },
    { call: 'clearCustomContext' },
  ];

  cases.forEach(data => {
    test(`${data.call} passes no undefined argument`, () => {
      expect(args(data).some(value => value === undefined)).toBe(false);
    });
  });
});
