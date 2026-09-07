/**
 * Call construction - one case per `call` value, on a page where the SDK is
 * already loaded (so the template dispatches directly rather than buffering).
 */

const { runTemplate, loadedSdkWindow } = require('./helpers/sandbox');

const withSdk = data => runTemplate(data, { window: loadedSdkWindow() });

const only = result => {
  expect(result.callInWindow).toHaveLength(1);
  return result.callInWindow[0];
};

describe('call construction', () => {
  test('page with no fields sends an empty properties object', () => {
    const result = withSdk({ call: 'page' });
    expect(only(result)).toEqual({ path: 'rudderanalytics.page', args: [{}] });
    expect(result.gtmOnSuccess).toHaveBeenCalledTimes(1);
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });

  test('track sends the event name and properties', () => {
    const result = withSdk({
      call: 'track',
      event: 'Order Completed',
      customProperties: [{ key: 'revenue', value: 99 }],
    });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.track',
      args: ['Order Completed', { revenue: 99 }],
    });
  });

  test('track with the object-action framework builds the event name', () => {
    const result = withSdk({
      call: 'track',
      useObjectAction: true,
      object: 'Order',
      action: 'Completed',
    });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.track',
      args: [
        'Order Completed',
        { category: 'Order', object: 'Order', action: 'Completed' },
      ],
    });
  });

  test('identify sends the user id and traits', () => {
    const result = withSdk({
      call: 'identify',
      userId: 'user-1',
      customProperties: [{ key: 'email', value: 'a@b.com' }],
    });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.identify',
      args: ['user-1', { email: 'a@b.com' }],
    });
  });

  test('group sends the group id and traits', () => {
    const result = withSdk({
      call: 'group',
      groupId: 'group-1',
      customProperties: [{ key: 'plan', value: 'enterprise' }],
    });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.group',
      args: ['group-1', { plan: 'enterprise' }],
    });
  });

  test('alias sends the new identifier', () => {
    const result = withSdk({ call: 'alias', to: 'new-id' });
    expect(only(result)).toEqual({ path: 'rudderanalytics.alias', args: ['new-id'] });
  });

  test('reset sends the SDK default reset options when untouched', () => {
    const result = withSdk({
      call: 'reset',
      resetUserId: true,
      resetUserTraits: true,
      resetGroupId: true,
      resetGroupTraits: true,
      resetSessionInfo: true,
      resetAuthToken: true,
      resetAnonymousId: false,
      resetInitialReferrer: false,
      resetInitialReferringDomain: false,
    });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.reset',
      args: [
        {
          entries: {
            userId: true,
            userTraits: true,
            anonymousId: false,
            groupId: true,
            groupTraits: true,
            initialReferrer: false,
            initialReferringDomain: false,
            sessionInfo: true,
            authToken: true,
          },
        },
      ],
    });
  });

  test('reset honours individual checkbox overrides', () => {
    const result = withSdk({ call: 'reset', resetAnonymousId: true });
    expect(only(result).args[0].entries).toEqual({
      userId: false,
      userTraits: false,
      anonymousId: true,
      groupId: false,
      groupTraits: false,
      initialReferrer: false,
      initialReferringDomain: false,
      sessionInfo: false,
      authToken: false,
    });
  });

  test('consent forwards the consent options', () => {
    const consentOptions = { consentManagement: { enabled: true } };
    const result = withSdk({ call: 'consent', consentOptions });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.consent',
      args: [consentOptions],
    });
  });

  test('consent with no options calls consent()', () => {
    const result = withSdk({ call: 'consent' });
    expect(only(result)).toEqual({ path: 'rudderanalytics.consent', args: [] });
  });

  test('startSession with no session id calls startSession()', () => {
    const result = withSdk({ call: 'startSession' });
    expect(only(result)).toEqual({ path: 'rudderanalytics.startSession', args: [] });
  });

  test('startSession coerces the session id to a number', () => {
    const result = withSdk({ call: 'startSession', sessionId: '1735689600000' });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.startSession',
      args: [1735689600000],
    });
  });

  test('endSession takes no arguments', () => {
    const result = withSdk({ call: 'endSession' });
    expect(only(result)).toEqual({ path: 'rudderanalytics.endSession', args: [] });
  });

  test('setAnonymousId forwards the anonymous id', () => {
    const result = withSdk({ call: 'setAnonymousId', anonymousId: 'anon-1' });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.setAnonymousId',
      args: ['anon-1'],
    });
  });

  test('setCustomContext forwards the context object', () => {
    const customContext = { app: { name: 'store' } };
    const result = withSdk({ call: 'setCustomContext', customContext });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.setCustomContext',
      args: [customContext],
    });
  });

  test('clearCustomContext takes no arguments', () => {
    const result = withSdk({ call: 'clearCustomContext' });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.clearCustomContext',
      args: [],
    });
  });

  test('setAuthToken forwards the token', () => {
    const result = withSdk({ call: 'setAuthToken', authToken: 'token-1' });
    expect(only(result)).toEqual({
      path: 'rudderanalytics.setAuthToken',
      args: ['token-1'],
    });
  });
});

describe('property construction', () => {
  test('an empty Default properties field injects no junk key', () => {
    const result = withSdk({ call: 'track', event: 'Clicked' });
    expect(only(result).args[1]).toEqual({});
  });

  test('a null Default properties variable is ignored', () => {
    const result = withSdk({ call: 'track', event: 'Clicked', defaultProperties: null });
    expect(only(result).args[1]).toEqual({});
  });

  test('a scalar Default properties variable is ignored', () => {
    const result = withSdk({ call: 'track', event: 'Clicked', defaultProperties: 'nope' });
    expect(only(result).args[1]).toEqual({});
  });

  test('custom properties beat default properties', () => {
    const result = withSdk({
      call: 'track',
      event: 'Clicked',
      defaultProperties: { tier: 'shared', source: 'default' },
      customProperties: [{ key: 'tier', value: 'tag-specific' }],
    });
    expect(only(result).args[1]).toEqual({ tier: 'tag-specific', source: 'default' });
  });

  test('object-action properties do not override an explicit custom property', () => {
    const result = withSdk({
      call: 'track',
      useObjectAction: true,
      object: 'Order',
      action: 'Completed',
      customProperties: [{ key: 'category', value: 'Checkout' }],
    });
    expect(only(result).args[1]).toEqual({
      category: 'Checkout',
      object: 'Order',
      action: 'Completed',
    });
  });

  test('an empty custom properties table contributes nothing', () => {
    const result = withSdk({
      call: 'track',
      event: 'Clicked',
      customProperties: [],
      defaultProperties: { a: 1 },
    });
    expect(only(result).args[1]).toEqual({ a: 1 });
  });
});

describe('options assembly', () => {
  test('suppressGa emits the legacy Google Analytics payload', () => {
    const result = withSdk({ call: 'identify', userId: 'u1', suppressGa: true });
    expect(only(result).args[2]).toEqual({
      integrations: { All: true, 'Google Analytics': false },
    });
  });

  test('suppressGa accepts the string "true" as it did before', () => {
    const result = withSdk({ call: 'identify', userId: 'u1', suppressGa: 'true' });
    expect(only(result).args[2]).toEqual({
      integrations: { All: true, 'Google Analytics': false },
    });
  });

  test('suppressGa false sends no options', () => {
    const result = withSdk({ call: 'identify', userId: 'u1', suppressGa: false });
    expect(only(result).args).toEqual(['u1', {}]);
  });

  test('eventOptions wins over suppressGa', () => {
    const result = withSdk({
      call: 'identify',
      userId: 'u1',
      suppressGa: true,
      eventOptions: { integrations: { All: false, Amplitude: true } },
    });
    expect(only(result).args[2]).toEqual({
      integrations: { All: false, Amplitude: true },
    });
  });

  test('eventOptions is forwarded on page calls', () => {
    const result = withSdk({
      call: 'page',
      eventOptions: { anonymousId: 'anon-9' },
    });
    expect(only(result).args).toEqual([{}, { anonymousId: 'anon-9' }]);
  });

  test('a non-object eventOptions variable is ignored', () => {
    const result = withSdk({ call: 'track', event: 'Clicked', eventOptions: 'nope' });
    expect(only(result).args).toEqual(['Clicked', {}]);
  });
});
