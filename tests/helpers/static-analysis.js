/**
 * Static analysis of the sandboxed code and the permission manifest.
 *
 * GTM enforces `access_globals` and `inject_script` at runtime against a fixed
 * allowlist of *literal* key paths. Nothing in the GTM editor cross-checks the
 * code against the manifest, which is how `group` shipped in the dropdown in
 * 2022 with no permission entry and no code branch. These helpers make that
 * cross-check a static test.
 */

/** Removes comments while leaving string literals intact. */
function stripComments(code) {
  let out = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') {
          out += code[i];
          i += 1;
        }
        out += code[i];
        i += 1;
      }
      out += quote;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** Collects `const NAME = 'literal';` declarations so constants can be resolved. */
function collectStringConstants(code) {
  const constants = {};
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])((?:\\.|(?!\2).)*)\2\s*;/g;
  let match = re.exec(code);
  while (match) {
    constants[match[1]] = match[3];
    match = re.exec(code);
  }
  return constants;
}

/** Returns the raw source of each argument of every `fnName(...)` call site. */
function findCallSites(code, fnName) {
  const sites = [];
  const re = new RegExp(`(^|[^\\w$.])${fnName}\\s*\\(`, 'g');
  let match = re.exec(code);

  while (match) {
    let i = match.index + match[0].length;
    let depth = 1;
    let argStart = i;
    const args = [];

    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        i += 1;
        while (i < code.length && code[i] !== quote) {
          if (code[i] === '\\') {
            i += 1;
          }
          i += 1;
        }
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        if (depth === 0) {
          args.push(code.slice(argStart, i).trim());
        }
      } else if (ch === ',' && depth === 1) {
        args.push(code.slice(argStart, i).trim());
        argStart = i + 1;
      }
      i += 1;
    }

    sites.push(args.filter(a => a.length > 0));
    match = re.exec(code);
  }

  return sites;
}

/** Resolves an argument's source text to a string, or reports it as dynamic. */
function resolveStringArgument(source, constants) {
  const literal = /^(['"])((?:\\.|(?!\1).)*)\1$/.exec(source);
  if (literal) {
    return { value: literal[2], dynamic: false };
  }
  const identifier = /^[A-Za-z_$][\w$]*$/.exec(source);
  if (identifier && Object.prototype.hasOwnProperty.call(constants, source)) {
    return { value: constants[source], dynamic: false };
  }
  return { value: source, dynamic: true };
}

const GLOBAL_ACCESS_APIS = {
  callInWindow: 'execute',
  copyFromWindow: 'read',
  setInWindow: 'write',
};

/**
 * Every global the code reaches for, with the `access_globals` flag it needs.
 * `dynamic: true` marks a key path the manifest can never be proven against.
 */
function findGlobalAccesses(code) {
  const clean = stripComments(code);
  const constants = collectStringConstants(clean);
  const accesses = [];

  Object.keys(GLOBAL_ACCESS_APIS).forEach(api => {
    findCallSites(clean, api).forEach(args => {
      if (args.length === 0) {
        return;
      }
      const resolved = resolveStringArgument(args[0], constants);
      accesses.push({
        api,
        need: GLOBAL_ACCESS_APIS[api],
        key: resolved.value,
        dynamic: resolved.dynamic,
      });
    });
  });

  return accesses;
}

/** Every URL passed to `injectScript`. */
function findInjectedUrls(code) {
  const clean = stripComments(code);
  const constants = collectStringConstants(clean);

  return findCallSites(clean, 'injectScript')
    .filter(args => args.length > 0)
    .map(args => resolveStringArgument(args[0], constants));
}

/** Every `call` value the code branches on, i.e. `call === 'track'`. */
function findHandledCalls(code) {
  const clean = stripComments(code);
  const re = /\bcall\s*===\s*(['"])([^'"]+)\1/g;
  const values = new Set();
  let match = re.exec(clean);
  while (match) {
    values.add(match[2]);
    match = re.exec(clean);
  }
  return values;
}

function parseAccessGlobals(permissions) {
  const entries = [];

  permissions.forEach(permission => {
    const instance = permission.instance || {};
    const key = instance.key || {};
    if (key.publicId !== 'access_globals') {
      return;
    }
    (instance.param || []).forEach(param => {
      if (param.key !== 'keys') {
        return;
      }
      ((param.value || {}).listItem || []).forEach(item => {
        const record = {};
        (item.mapKey || []).forEach((mapKey, index) => {
          const mapValue = (item.mapValue || [])[index] || {};
          record[mapKey.string] =
            mapValue.type === 8 ? mapValue.boolean : mapValue.string;
        });
        entries.push({
          key: record.key,
          read: record.read === true,
          write: record.write === true,
          execute: record.execute === true,
        });
      });
    });
  });

  return entries;
}

function parseInjectScriptUrls(permissions) {
  const urls = [];

  permissions.forEach(permission => {
    const instance = permission.instance || {};
    const key = instance.key || {};
    if (key.publicId !== 'inject_script') {
      return;
    }
    (instance.param || []).forEach(param => {
      if (param.key !== 'urls') {
        return;
      }
      ((param.value || {}).listItem || []).forEach(item => {
        urls.push(item.string);
      });
    });
  });

  return urls;
}

function matchesUrlPattern(url, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

/**
 * The manifest lint. Returns a list of human-readable violations; an empty list
 * means every global the code touches is declared with the right flag.
 */
function findManifestViolations(code, permissions) {
  const violations = [];
  const declared = parseAccessGlobals(permissions);
  const declaredUrls = parseInjectScriptUrls(permissions);

  findGlobalAccesses(code).forEach(access => {
    if (access.dynamic) {
      violations.push(
        `${access.api} uses a non-literal key path (${access.key}); GTM validates ` +
          'key paths against a fixed allowlist, so it cannot be proven declared',
      );
      return;
    }
    const entry = declared.find(candidate => candidate.key === access.key);
    if (!entry) {
      violations.push(
        `${access.api}("${access.key}") has no access_globals entry in ___WEB_PERMISSIONS___`,
      );
      return;
    }
    if (entry[access.need] !== true) {
      violations.push(
        `${access.api}("${access.key}") needs access_globals "${access.need}" but it is not granted`,
      );
    }
  });

  findInjectedUrls(code).forEach(url => {
    if (url.dynamic) {
      violations.push(`injectScript uses a non-literal URL (${url.value})`);
      return;
    }
    if (!declaredUrls.some(pattern => matchesUrlPattern(url.value, pattern))) {
      violations.push(`injectScript("${url.value}") is not covered by any inject_script permission`);
    }
  });

  return violations;
}

/** Every param name in the field model, including those nested inside GROUPs. */
function collectParamNames(params, into = new Set()) {
  params.forEach(param => {
    if (param.name) {
      into.add(param.name);
    }
    if (Array.isArray(param.subParams)) {
      collectParamNames(param.subParams, into);
    }
  });
  return into;
}

/** Every `enablingConditions` entry in the field model, flattened. */
function collectEnablingConditions(params, into = []) {
  params.forEach(param => {
    (param.enablingConditions || []).forEach(condition => {
      into.push({ owner: param.name, condition });
    });
    if (Array.isArray(param.subParams)) {
      collectEnablingConditions(param.subParams, into);
    }
  });
  return into;
}

function findParam(params, name) {
  for (let i = 0; i < params.length; i += 1) {
    const param = params[i];
    if (param.name === name) {
      return param;
    }
    if (Array.isArray(param.subParams)) {
      const nested = findParam(param.subParams, name);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

module.exports = {
  stripComments,
  collectStringConstants,
  findCallSites,
  findGlobalAccesses,
  findInjectedUrls,
  findHandledCalls,
  parseAccessGlobals,
  parseInjectScriptUrls,
  matchesUrlPattern,
  findManifestViolations,
  collectParamNames,
  collectEnablingConditions,
  findParam,
};
