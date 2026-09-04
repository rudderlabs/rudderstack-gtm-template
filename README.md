# RudderStack GTM Template

A [Google Tag Manager](https://tagmanager.google.com) tag template that sends events to
RudderStack, and can optionally load the
[RudderStack JavaScript SDK](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/)
for you.

Released under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0).

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Loading the SDK from GTM](#loading-the-sdk-from-gtm)
- [Field reference](#field-reference)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Manual import](#manual-import)
- [Development](#development)
- [Contact us](#contact-us)

## Requirements

The template targets **JavaScript SDK v3**. The three calls that shipped in the original
2022 template (`page`, `track`, `identify`) still work against v1.1, but nothing else does.

| Call | Minimum SDK version |
| --- | --- |
| `page`, `track`, `identify`, `group`, `alias`, `consent`, `startSession`, `endSession`, `setAnonymousId`, `setAuthToken` | 3.0.0 |
| `reset` (this template always sends `ResetOptions`, never the deprecated boolean) | 3.24.0 |
| `setCustomContext`, `clearCustomContext` | 3.32.0 |

## Quick start

1. In your GTM workspace, go to **Templates** and add **RudderStack** from the Community
   Template Gallery.
2. Make sure the RudderStack JavaScript SDK is on the page — either through the
   [loading snippet](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/quick-start-guide/)
   or through a `load` tag from this same template (see below).
3. Create a tag from the template, pick a **Call**, fill in the fields for that call, and
   attach a trigger.

The tag reports failure to GTM, with a reason in the debug console, when it cannot send
the call. See [Troubleshooting](#troubleshooting).

## Loading the SDK from GTM

> [!WARNING]
> **Not yet available.** The `load` call value is implemented but depends on a CDN-hosted
> loader artifact (`https://cdn.rudderlabs.com/v3/loader.min.js`) that **has not been
> published yet**. It has to be built and released from the
> [rudder-sdk-js](https://github.com/rudderlabs/rudder-sdk-js) monorepo
> (`packages/loading-scripts`) first. Until then, keep loading the SDK with the snippet in
> a Custom HTML tag. The URL lives in a single named constant at the top of the template's
> code, so pointing it elsewhere is a one-line change plus the matching `inject_script`
> permission entry.

Once the artifact ships, the setup is:

1. Create a tag from this template with **Call** set to `load`.
2. Fill in **Write key** and **Data plane URL** from your RudderStack source, and
   optionally point **Load options** at a JSON variable holding the SDK's `LoadOptions`.
3. Trigger it on **Initialization - All Pages** so it runs before your event tags.

The tag creates `window.rudderanalytics` as an empty array if it is not already there,
pushes the `load` call onto it, and injects the loader. The loader does the feature
detection, method stubs, `globalThis` shim and polyfill branch that a GTM sandbox cannot
express, then loads the SDK, which replays the buffered call.

Event tags do not have to wait for it. While `window.rudderanalytics` is still an array,
this template pushes onto the SDK's pre-load buffer, which the SDK replays on load. That
counts as a success, not a dropped call.

## Field reference

**Call** picks the API method. Everything else is shown only for the calls it applies to.

### Event calls

| Field | Call | Required | Notes |
| --- | --- | --- | --- |
| Category | `page` | no | Only sent as the page category when **Name** is also set. The SDK declares no overload that takes a category on its own, so on its own it is sent as a page property instead. |
| Name | `page` | no | Page name. |
| Use object action | `track` | no | When `True`, the event name is `Object + " " + Action`, and `category`, `object` and `action` are added as properties. |
| Event | `track` | yes, unless **Use object action** is `True` | Event name. |
| Object, Action | `track` | yes, when **Use object action** is `True` | |
| User id | `identify` | no | Leave empty to update the current user's traits without changing their identity. |
| Group id | `group` | no | Leave empty to update the current group's traits without changing it. |
| To | `alias` | yes | The new identifier. |
| From | `alias` | no | Previous identifier. Defaults to the current user id. |
| Default properties or traits | `page`, `track`, `identify`, `group` | no | A JSON object variable merged into every such call. |
| Custom properties or traits | `page`, `track`, `identify`, `group` | no | Per-tag key/value table. **Takes precedence over Default properties or traits.** |
| Options | `page`, `track`, `identify`, `group`, `alias` | no | A JSON object variable sent as the call's `ApiOptions`: per-event `integrations` filtering, `anonymousId`, `originalTimestamp`, context overrides. |
| Suppress Google Analytics | `identify` | no | **Deprecated.** Emits `{integrations: {All: true, "Google Analytics": false}}`, which targets the deprecated Universal Analytics destination and has no effect on Google Analytics 4 (GA4). Use **Options** instead. An explicit **Options** value overrides it. |

### Identity and session calls

| Field | Call | Required | Notes |
| --- | --- | --- | --- |
| Reset options | `reset` | no | Nine checkboxes mapping to the SDK's `ResetOptions.entries`. Pre-set to the SDK's own `DEFAULT_RESET_OPTIONS`, so an untouched tag reproduces a plain `reset()`: user id, user traits, group id, group traits, session info and auth token on; anonymous id, initial referrer and initial referring domain off. |
| Anonymous id | `setAnonymousId` | yes | |
| Session id | `startSession` | no | Must be numeric. Leave empty to let the SDK generate one. |
| Auth token | `setAuthToken` | yes | |
| Custom context | `setCustomContext` | yes | A JSON object variable merged into the context of every subsequent event. |
| Consent options | `consent` | no | A JSON object variable holding the SDK's `ConsentOptions`. |

`endSession` and `clearCustomContext` take no fields.

### SDK loading

| Field | Call | Required |
| --- | --- | --- |
| Write key | `load` | yes |
| Data plane URL | `load` | yes |
| Load options | `load` | no |

## Limitations

- **The SDK global name is hardcoded to `rudderanalytics`.** GTM requires `access_globals`
  key paths to be literal strings in the permission manifest and validates every call
  against that fixed allowlist at runtime, so a configurable global name — and therefore
  multiple SDK instances on one page — cannot be supported.
- **No getters.** `getAnonymousId`, `getUserId`, `getSessionId` and friends would need a
  GTM *variable* template, which is a different template type in its own repository.
- **No `ready()` callback.** The SDK's pre-load buffer already handles ordering, and a
  wrapper would mask the failures this template exists to surface.
- **No Consent Mode v2 integration.** The template does not declare `consentSettings` and
  does not use GTM's `addConsentListener`. In a Consent Mode container, gate the tag with
  triggers and exceptions.
- **Web containers only.** Server-side GTM uses a different API set.

## Troubleshooting

### The tag fired but no request left the browser

Open GTM Preview, switch the container to a debug environment and check the browser
console. The template logs a reason and reports a tag failure whenever it does not
dispatch a call:

| Console message | Cause | Fix |
| --- | --- | --- |
| `the "rudderanalytics" global was not found on this page` | The SDK is not on the page. | Add the loading snippet, or a `load` tag from this template, on an **Initialization - All Pages** trigger. |
| `unsupported Call value` | The **Call** field is empty or holds a value this template does not implement. | Pick a value from the dropdown. |
| `Event is required for the track call` | The **Event** field resolved to empty — often a GTM variable that returned nothing. | Check the variable in Preview. |
| `Object and Action are both required` | **Use object action** is `True` but one of them is empty. | Fill both, or set **Use object action** to `False`. |
| `To is required for the alias call` | | |
| `Anonymous id is required` / `Auth token is required` | | |
| `Custom context must be a JSON object variable` / `Consent options must be a JSON object variable` | The variable resolved to a string or to nothing. | Point the field at a variable that returns an object. |
| `Session id must be a number` | | Use a numeric timestamp. |

If GTM reports the tag as **Fired** with no console message, the call was dispatched. Look
at the Network tab for a request to your data plane; if there is none, the problem is in
the SDK's configuration rather than in this tag.

### A tag-specific value is being overwritten

It no longer is. Before this version, **Default properties or traits** was merged *after*
**Custom properties or traits** and therefore won. That is reversed: custom values now
take precedence.

### Empty events used to carry a `defaultProp` key

Also fixed. An empty or non-object **Default properties or traits** variable now
contributes nothing, instead of injecting a `defaultProp` / `defaultTrait` key into every
event.

## Manual import

1. Download
   [template.tpl](https://raw.githubusercontent.com/rudderlabs/rudderstack-gtm-template/main/template.tpl).
2. In your GTM workspace, go to **Templates**.
3. Click **New** in the **Tag Templates** section.
4. Click **Import** from the right menu bar.
5. Select the downloaded file and save.

## Development

`template.tpl` is the only artifact that ships. The Jest harness in `tests/` extracts its
`___SANDBOXED_JS_FOR_WEB_TEMPLATE___` block and runs it against mocked GTM APIs.

```sh
npm install
npm test
```

The suite covers three families:

- **Call construction** — one case per `call` value, every overload row, SDK-loaded versus
  SDK-buffering dispatch, and every failure condition.
- **Manifest lint** — every `callInWindow` / `copyFromWindow` / `setInWindow` key path and
  every `injectScript` URL reachable in the code must be declared in
  `___WEB_PERMISSIONS___`, with the right flag. This is what would have caught `group`
  shipping in the dropdown in 2022 with no permission entry.
- **Field-model lint** — every `call` dropdown value has a code branch, every
  `enablingConditions` chain references a field that exists, and every field name that
  shipped in 2022 still exists.

The `___TESTS___` block inside `template.tpl` is a smoke test for the GTM editor's test
tab, not the source of truth.

Two things the harness cannot check, because Node is not GTM: how GTM marshals values
across `callInWindow`, and how its runtime validates the permission manifest. Verify those
in a GTM preview container before publishing.

## Contact us

If you come across any issue, start a conversation on our
[Slack](https://resources.rudderstack.com/join-rudderstack-slack) channel.
