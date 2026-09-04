/**
 * Success and failure semantics - design doc s8.
 *
 * The 2022 template called `gtmOnSuccess()` unconditionally, so GTM Preview
 * said "Fired", the console was clean, and no request left the browser. That is
 * what made the customer escalation hard to debug.
 */

const { runTemplate, loadedSdkWindow, bufferingSdkWindow } = require('./helpers/sandbox');

const expectFailure = result => {
  expect(result.gtmOnFailure).toHaveBeenCalledTimes(1);
  expect(result.gtmOnSuccess).not.toHaveBeenCalled();
  expect(result.callInWindow).toEqual([]);
  expect(result.logs.length).toBeGreaterThan(0);
};

describe('SDK global absent', () => {
  const calls = [
    { call: 'page' },
    { call: 'track', event: 'Clicked' },
    { call: 'identify', userId: 'u1' },
    { call: 'group', groupId: 'g1' },
    { call: 'alias', to: 'new' },
    { call: 'reset' },
    { call: 'consent' },
    { call: 'startSession' },
    { call: 'endSession' },
    { call: 'setAnonymousId', anonymousId: 'a1' },
    { call: 'setCustomContext', customContext: { a: 1 } },
    { call: 'clearCustomContext' },
    { call: 'setAuthToken', authToken: 't1' },
  ];

  calls.forEach(data => {
    test(`${data.call} fails rather than reporting a phantom success`, () => {
      expectFailure(runTemplate(data, { window: {} }));
    });
  });

  test('the logged reason names the missing global', () => {
    const result = runTemplate({ call: 'page' }, { window: {} });
    expect(JSON.stringify(result.logs)).toContain('rudderanalytics');
  });

  test('a null global is treated as absent', () => {
    expectFailure(runTemplate({ call: 'page' }, { window: { rudderanalytics: null } }));
  });

  test('load is exempt - it is what creates the global', () => {
    const result = runTemplate(
      { call: 'load', writeKey: 'wk', dataPlaneUrl: 'https://dp' },
      { window: {} },
    );
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });
});

describe('SDK global is still the array buffer', () => {
  test('the call is buffered and counts as a success', () => {
    const result = runTemplate({ call: 'page' }, { window: bufferingSdkWindow() });
    expect(result.gtmOnSuccess).toHaveBeenCalledTimes(1);
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });
});

describe('unknown call value', () => {
  test('fails with a logged reason', () => {
    expectFailure(runTemplate({ call: 'teleport' }, { window: loadedSdkWindow() }));
  });

  test('an unset call fails', () => {
    expectFailure(runTemplate({}, { window: loadedSdkWindow() }));
  });
});

describe('required argument missing', () => {
  const cases = [
    ['track with no event name', { call: 'track' }],
    ['track with an empty event name', { call: 'track', event: '' }],
    ['object-action track with no object', { call: 'track', useObjectAction: true, action: 'Completed' }],
    ['object-action track with no action', { call: 'track', useObjectAction: true, object: 'Order' }],
    ['alias with no target identifier', { call: 'alias' }],
    ['setAnonymousId with no id', { call: 'setAnonymousId' }],
    ['setAuthToken with no token', { call: 'setAuthToken' }],
    ['setCustomContext with no context', { call: 'setCustomContext' }],
    ['setCustomContext with a non-object context', { call: 'setCustomContext', customContext: 'nope' }],
    ['consent with a non-object options variable', { call: 'consent', consentOptions: 'nope' }],
    ['startSession with a non-numeric session id', { call: 'startSession', sessionId: 'later' }],
  ];

  cases.forEach(([label, data]) => {
    test(`${label} fails`, () => {
      expectFailure(runTemplate(data, { window: loadedSdkWindow() }));
    });
  });

  const loadCases = [
    ['load with no write key', { call: 'load', dataPlaneUrl: 'https://dp' }],
    ['load with no data plane URL', { call: 'load', writeKey: 'wk' }],
  ];

  loadCases.forEach(([label, data]) => {
    test(`${label} fails without injecting anything`, () => {
      const result = runTemplate(data, { window: {} });
      expect(result.gtmOnFailure).toHaveBeenCalledTimes(1);
      expect(result.gtmOnSuccess).not.toHaveBeenCalled();
      expect(result.injectScript).toEqual([]);
      expect(result.setInWindow).toEqual([]);
    });
  });
});

describe('success', () => {
  test('a dispatched call reports success exactly once', () => {
    const result = runTemplate({ call: 'track', event: 'Clicked' }, {
      window: loadedSdkWindow(),
    });
    expect(result.gtmOnSuccess).toHaveBeenCalledTimes(1);
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });
});

describe('a global that is not the SDK', () => {
  // Dispatching into a scalar is a no-op that would still report success -- the
  // failure mode this template exists to surface.
  test.each(['string', 42, true])('refuses to dispatch into %p', value => {
    const result = runTemplate(
      { call: 'track', event: 'Order Completed' },
      { window: { rudderanalytics: value } },
    );
    expect(result.callInWindow).toEqual([]);
    expect(result.gtmOnFailure).toHaveBeenCalledTimes(1);
    expect(result.gtmOnSuccess).not.toHaveBeenCalled();
  });
});
