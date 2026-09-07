/**
 * A Node stand-in for the GTM sandboxed-JavaScript runtime.
 *
 * The template's ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ block is executed verbatim
 * with `require` and `data` supplied, and every GTM API it can reach is mocked
 * so a test can assert the exact SDK call and the exact argument list.
 *
 * Known blind spot (design doc s10): this cannot reproduce how GTM marshals
 * values across `callInWindow`, nor how GTM's runtime validates the permission
 * manifest. Those stay manual pre-publish checks in a preview container. What
 * this harness does cover is the manifest *lint* - see tests/manifest-lint.
 */

const { getSandboxedCode } = require('./tpl');

/** GTM's `getType` API. */
function gtmGetType(value) {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function resolvePath(root, path) {
  const parts = path.split('.');
  let cursor = root;
  for (let i = 0; i < parts.length; i += 1) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }
    cursor = cursor[parts[i]];
  }
  return cursor;
}

/**
 * Runs the template's sandboxed code.
 *
 * @param {object} data              Mocked field values (`data.*` in the template).
 * @param {object} [options]
 * @param {object} [options.window]  Initial state of the page's global object.
 * @param {boolean} [options.injectScriptSucceeds] Outcome of `injectScript`.
 * @param {string} [options.code]    Override the code under test (used by meta-tests).
 */
function runTemplate(data, options = {}) {
  const win = options.window ? Object.assign({}, options.window) : {};
  const injectScriptSucceeds = options.injectScriptSucceeds !== false;

  const record = {
    window: win,
    callInWindow: [],
    copyFromWindow: [],
    setInWindow: [],
    injectScript: [],
    logs: [],
    required: [],
  };

  const gtmOnSuccess = jest.fn();
  const gtmOnFailure = jest.fn();

  const api = {
    logToConsole: (...args) => {
      record.logs.push(args);
    },
    JSON: {
      parse: value => {
        try {
          return JSON.parse(value);
        } catch (e) {
          return undefined;
        }
      },
      stringify: value => JSON.stringify(value),
    },
    Object: {
      keys: obj => Object.keys(obj),
      values: obj => Object.values(obj),
      entries: obj => Object.entries(obj),
      freeze: obj => Object.freeze(obj),
      delete: (obj, key) => {
        delete obj[key];
      },
    },
    getType: gtmGetType,
    makeNumber: value => Number(value),
    makeString: value => String(value),
    makeInteger: value => parseInt(value, 10),
    callInWindow(path) {
      // Capture the exact arity the template used - a trailing `undefined`
      // is a real difference in overload resolution, so it must be visible.
      const args = Array.prototype.slice.call(arguments, 1);
      record.callInWindow.push({ path, args });

      const target = resolvePath(win, path);
      if (typeof target === 'function') {
        const holderPath = path.split('.').slice(0, -1).join('.');
        const holder = holderPath ? resolvePath(win, holderPath) : win;
        return target.apply(holder, args);
      }
      return undefined;
    },
    copyFromWindow(key) {
      record.copyFromWindow.push(key);
      return resolvePath(win, key);
    },
    setInWindow(key, value, overrideExisting) {
      const existing = resolvePath(win, key);
      const willSet = existing === undefined || overrideExisting === true;
      // Snapshot the value: the template hands over a live array that it then
      // pushes onto, and the record has to show what was set, not what it grew
      // into.
      record.setInWindow.push({
        key,
        value: Array.isArray(value) ? value.slice() : value,
        overrideExisting,
        result: willSet,
      });
      if (willSet) {
        win[key] = value;
      }
      return willSet;
    },
    injectScript(url, onSuccess, onFailure, cacheToken) {
      record.injectScript.push({ url, cacheToken });
      if (injectScriptSucceeds) {
        if (onSuccess) {
          onSuccess();
        }
      } else if (onFailure) {
        onFailure();
      }
    },
    makeTableMap(tableObj, keyColumnName, valueColumnName) {
      if (!Array.isArray(tableObj) || tableObj.length === 0) {
        return null;
      }
      const map = {};
      let count = 0;
      tableObj.forEach(row => {
        if (row && row[keyColumnName]) {
          map[row[keyColumnName]] = row[valueColumnName];
          count += 1;
        }
      });
      return count === 0 ? null : map;
    },
  };

  const sandboxRequire = name => {
    record.required.push(name);
    if (!Object.prototype.hasOwnProperty.call(api, name)) {
      throw new Error(`Template required an unmocked GTM API: "${name}"`);
    }
    return api[name];
  };

  const code = options.code !== undefined ? options.code : getSandboxedCode();
  const templateData = Object.assign({ gtmOnSuccess, gtmOnFailure }, data);

  // eslint-disable-next-line no-new-func
  const fn = new Function('require', 'data', code);
  fn(sandboxRequire, templateData);

  return Object.assign(record, { gtmOnSuccess, gtmOnFailure, data: templateData });
}

/** A `window` in which the SDK is fully loaded (the global is the SDK instance). */
function loadedSdkWindow() {
  return { rudderanalytics: { __loaded: true } };
}

/** A `window` in which only the pre-load buffer exists (the global is an Array). */
function bufferingSdkWindow() {
  const buffer = [];
  return { rudderanalytics: buffer };
}

module.exports = {
  runTemplate,
  loadedSdkWindow,
  bufferingSdkWindow,
  gtmGetType,
};
