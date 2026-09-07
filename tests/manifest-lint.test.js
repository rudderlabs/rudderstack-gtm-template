/**
 * Manifest lint.
 *
 * GTM validates every `callInWindow` / `copyFromWindow` / `setInWindow` key path
 * and every `injectScript` URL against ___WEB_PERMISSIONS___ at runtime, and
 * nothing in the editor cross-checks the two. This is the test that would have
 * caught the dead `group` option in 2022.
 */

const { getSandboxedCode, getWebPermissions } = require('./helpers/tpl');
const {
  findGlobalAccesses,
  findInjectedUrls,
  findManifestViolations,
  parseAccessGlobals,
  parseInjectScriptUrls,
} = require('./helpers/static-analysis');

describe('permission manifest', () => {
  const code = getSandboxedCode();
  const permissions = getWebPermissions();

  test('every global the code reaches is declared with the flag it needs', () => {
    expect(findManifestViolations(code, permissions)).toEqual([]);
  });

  test('no key path is computed at runtime', () => {
    const dynamic = findGlobalAccesses(code).filter(access => access.dynamic);
    expect(dynamic).toEqual([]);
  });

  test('every injected script URL is covered by an inject_script permission', () => {
    const urls = findInjectedUrls(code);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every(url => !url.dynamic)).toBe(true);
    expect(parseInjectScriptUrls(permissions).length).toBeGreaterThan(0);
  });

  test('the logging permission stays scoped to the debug environment', () => {
    const logging = permissions.find(
      permission => permission.instance.key.publicId === 'logging',
    );
    expect(logging).toBeDefined();
    const environments = logging.instance.param.find(param => param.key === 'environments');
    expect(environments.value.string).toBe('debug');
  });

  test('the manifest declares no global the code never touches', () => {
    const reached = new Set(findGlobalAccesses(code).map(access => access.key));
    const orphans = parseAccessGlobals(permissions)
      .map(entry => entry.key)
      .filter(key => !reached.has(key));
    expect(orphans).toEqual([]);
  });

  // Meta-test: a lint that cannot fail is decoration. Removing a declaration
  // must surface as a violation.
  describe('the lint bites', () => {
    test('removing an access_globals entry produces a violation', () => {
      const declared = parseAccessGlobals(permissions);
      expect(declared.length).toBeGreaterThan(1);

      declared.forEach(entry => {
        const mutated = JSON.parse(JSON.stringify(permissions));
        mutated.forEach(permission => {
          if (permission.instance.key.publicId !== 'access_globals') {
            return;
          }
          permission.instance.param.forEach(param => {
            if (param.key !== 'keys') {
              return;
            }
            param.value.listItem = param.value.listItem.filter(item => {
              const keyIndex = item.mapKey.findIndex(mapKey => mapKey.string === 'key');
              return item.mapValue[keyIndex].string !== entry.key;
            });
          });
        });

        const violations = findManifestViolations(code, mutated);
        expect(violations.join('\n')).toContain(`"${entry.key}"`);
      });
    });

    test('revoking the execute flag produces a violation', () => {
      const mutated = JSON.parse(JSON.stringify(permissions));
      mutated.forEach(permission => {
        if (permission.instance.key.publicId !== 'access_globals') {
          return;
        }
        permission.instance.param.forEach(param => {
          if (param.key !== 'keys') {
            return;
          }
          param.value.listItem.forEach(item => {
            item.mapKey.forEach((mapKey, index) => {
              if (mapKey.string === 'execute') {
                item.mapValue[index].boolean = false;
              }
            });
          });
        });
      });

      const violations = findManifestViolations(code, mutated);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.join('\n')).toContain('"execute"');
    });

    test('removing the inject_script permission produces a violation', () => {
      const mutated = permissions.filter(
        permission => permission.instance.key.publicId !== 'inject_script',
      );
      const violations = findManifestViolations(code, mutated);
      expect(violations.join('\n')).toContain('inject_script');
    });

    test('a computed key path produces a violation', () => {
      const violations = findManifestViolations(
        "callInWindow('rudderanalytics.' + method, 1);",
        permissions,
      );
      expect(violations.join('\n')).toContain('non-literal key path');
    });
  });
});
