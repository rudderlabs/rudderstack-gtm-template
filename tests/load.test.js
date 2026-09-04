/**
 * `call = load` - design doc s6.2.
 *
 * The sandbox cannot reproduce the full loading snippet (no `eval`/`Function`
 * for build-type detection, no `globalThis` shim, no page-callable stubs), so
 * the template creates the buffer, pushes the `load` call onto it and injects a
 * CDN-hosted loader that does the rest as real page JavaScript.
 */

const { runTemplate, loadedSdkWindow, bufferingSdkWindow } = require('./helpers/sandbox');
const { getSandboxedCode } = require('./helpers/tpl');
const { collectStringConstants } = require('./helpers/static-analysis');

const LOAD_DATA = {
  call: 'load',
  writeKey: 'write-key-1',
  dataPlaneUrl: 'https://example.dataplane.rudderstack.com',
};

describe('load on a page with no SDK', () => {
  test('creates the buffer without overwriting an existing global', () => {
    const result = runTemplate(LOAD_DATA);
    expect(result.setInWindow).toEqual([
      { key: 'rudderanalytics', value: [], overrideExisting: false, result: true },
    ]);
  });

  test('pushes the load call onto the buffer', () => {
    const result = runTemplate(LOAD_DATA);
    expect(result.callInWindow).toEqual([
      {
        path: 'rudderanalytics.push',
        args: [['load', 'write-key-1', 'https://example.dataplane.rudderstack.com']],
      },
    ]);
  });

  test('forwards loadOptions when supplied', () => {
    const loadOptions = { logLevel: 'DEBUG' };
    const result = runTemplate(Object.assign({ loadOptions }, LOAD_DATA));
    expect(result.callInWindow[0].args[0]).toEqual([
      'load',
      'write-key-1',
      'https://example.dataplane.rudderstack.com',
      loadOptions,
    ]);
  });

  test('ignores a non-object loadOptions variable', () => {
    const result = runTemplate(Object.assign({ loadOptions: 'nope' }, LOAD_DATA));
    expect(result.callInWindow[0].args[0]).toHaveLength(3);
  });

  test('injects the loader from the RudderStack CDN', () => {
    const result = runTemplate(LOAD_DATA);
    expect(result.injectScript).toHaveLength(1);
    expect(result.injectScript[0].url).toMatch(/^https:\/\/cdn\.rudderlabs\.com\//);
  });

  test('reports success only once the loader script has landed', () => {
    const result = runTemplate(LOAD_DATA);
    expect(result.gtmOnSuccess).toHaveBeenCalledTimes(1);
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });

  test('reports failure when the loader script cannot be injected', () => {
    const result = runTemplate(LOAD_DATA, { injectScriptSucceeds: false });
    expect(result.gtmOnFailure).toHaveBeenCalledTimes(1);
    expect(result.gtmOnSuccess).not.toHaveBeenCalled();
  });

  // Leaving the buffer behind would make every later tag push onto an array
  // nothing will ever drain, and report success doing it.
  test('discards the buffer so later tags report the SDK as missing', () => {
    const result = runTemplate(LOAD_DATA, { injectScriptSucceeds: false });
    expect(result.window.rudderanalytics).toBeNull();
  });
});

describe('load on a page where the snippet already ran', () => {
  test('reuses the existing buffer instead of replacing it', () => {
    const result = runTemplate(LOAD_DATA, { window: bufferingSdkWindow() });
    expect(result.window.rudderanalytics).toEqual([
      ['load', 'write-key-1', 'https://example.dataplane.rudderstack.com'],
    ]);
  });

  // Whatever put the global there is already fetching the SDK. Injecting again
  // would duplicate the request and trip the loader's double-include guard.
  test('does not inject the loader a second time', () => {
    const result = runTemplate(LOAD_DATA, { window: bufferingSdkWindow() });
    expect(result.injectScript).toHaveLength(0);
    expect(result.gtmOnSuccess).toHaveBeenCalled();
    expect(result.gtmOnFailure).not.toHaveBeenCalled();
  });
});

describe('load on a page where the SDK is already loaded', () => {
  test('calls load directly rather than pushing onto a buffer that is gone', () => {
    const result = runTemplate(LOAD_DATA, { window: loadedSdkWindow() });
    expect(result.callInWindow).toEqual([
      {
        path: 'rudderanalytics.load',
        args: ['write-key-1', 'https://example.dataplane.rudderstack.com'],
      },
    ]);
  });

  test('does not inject the loader for an SDK that is already running', () => {
    const result = runTemplate(LOAD_DATA, { window: loadedSdkWindow() });
    expect(result.injectScript).toHaveLength(0);
    expect(result.gtmOnSuccess).toHaveBeenCalled();
  });
});

describe('loader artifact', () => {
  // Work item 3 is blocked on this artifact being published from the
  // rudder-sdk-js monorepo. Keeping the URL in one named constant is what makes
  // the switch a one-line change.
  test('the loader URL lives in a single named constant', () => {
    const constants = collectStringConstants(getSandboxedCode());
    const urls = Object.keys(constants).filter(name =>
      String(constants[name]).indexOf('cdn.rudderlabs.com') === 0 ||
      String(constants[name]).indexOf('https://cdn.rudderlabs.com') === 0);
    expect(urls).toHaveLength(1);
  });

  test('the constant carries the not-yet-published warning', () => {
    const code = getSandboxedCode();
    const index = code.indexOf('https://cdn.rudderlabs.com');
    expect(index).toBeGreaterThan(-1);
    const preamble = code.slice(Math.max(0, index - 800), index);
    expect(preamble.toLowerCase()).toContain('not yet published');
  });
});
