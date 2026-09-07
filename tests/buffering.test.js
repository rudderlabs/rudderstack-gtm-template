/**
 * SDK-loaded vs SDK-buffering dispatch.
 *
 * While `window.rudderanalytics` is still a plain Array, the SDK's pre-load
 * buffer is authoritative: `triggerBufferedLoadEvent` replays it and
 * `consumePreloadBufferedEvent`'s default branch dispatches any method, not
 * just the five event calls. Pushing is therefore a legitimate success, not a
 * dropped call.
 */

const { runTemplate, bufferingSdkWindow, loadedSdkWindow } = require('./helpers/sandbox');

const buffered = data => runTemplate(data, { window: bufferingSdkWindow() });

describe('buffering (the global is still an Array)', () => {
  test('a track call is pushed onto the buffer', () => {
    const result = buffered({
      call: 'track',
      event: 'Clicked',
      customProperties: [{ key: 'a', value: 1 }],
    });
    expect(result.callInWindow).toEqual([
      { path: 'rudderanalytics.push', args: [['track', 'Clicked', { a: 1 }]] },
    ]);
    expect(result.gtmOnSuccess).toHaveBeenCalledTimes(1);
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });

  test('the pushed entry is shaped like a PreloadedEventCall', () => {
    const result = buffered({ call: 'identify', userId: 'u1' });
    expect(result.window.rudderanalytics).toEqual([['identify', 'u1', {}]]);
  });

  test('an argument-free call is pushed as a single-element entry', () => {
    const result = buffered({ call: 'endSession' });
    expect(result.window.rudderanalytics).toEqual([['endSession']]);
  });

  test('overload truncation survives the buffer', () => {
    const result = buffered({ call: 'page', name: 'Home' });
    expect(result.window.rudderanalytics).toEqual([['page', 'Home', {}]]);
  });

  test('the template never writes to a global that already exists', () => {
    const result = buffered({ call: 'track', event: 'Clicked' });
    expect(result.setInWindow).toEqual([]);
  });
});

describe('loaded (the global is the SDK instance)', () => {
  test('the call is dispatched directly, not buffered', () => {
    const result = runTemplate({ call: 'track', event: 'Clicked' }, {
      window: loadedSdkWindow(),
    });
    expect(result.callInWindow.map(entry => entry.path)).toEqual([
      'rudderanalytics.track',
    ]);
  });
});
