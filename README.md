# RudderStack GTM Template

A [Google Tag Manager](https://tagmanager.google.com) tag template that sends events to
RudderStack, and can load the
[RudderStack JavaScript SDK](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/)
for you.

Released under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0).

## Contents

- [How it works](#how-it-works)
- [Installing the SDK](#installing-the-sdk)
  - [Method 1 — a load tag from this template](#method-1--a-load-tag-from-this-template)
  - [Method 2 — Custom HTML tag](#method-2--custom-html-tag)
- [Sending events](#sending-events)
- [Verifying your setup](#verifying-your-setup)
- [Requirements](#requirements)
- [Field reference](#field-reference)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Manual import](#manual-import)
- [Development](#development)
- [Contact us](#contact-us)

## How it works

A working setup has **two** moving parts, and most problems come from confusing them:

1. **The SDK on the page.** Something has to put `window.rudderanalytics` there and call
   [`load()`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/load-js-sdk/)
   with your write key and data plane URL.
2. **Tags built from this template.** Each one makes a single
   [SDK API call](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/)
   — `page`, `track`, `identify`, and so on — when its trigger fires.

This template is a **sandboxed** GTM custom template. Sandboxed code has no access to
`window`, `document`, the DOM, or `eval`. It reaches your page only through APIs that GTM
brokers and that are declared in the template's permission manifest. The one that matters
here is `callInWindow`:

```js
callInWindow('rudderanalytics.track', eventName, properties);
```

Two consequences follow, and they explain almost everything below.

**`window.rudderanalytics` must already exist when a tag fires.** GTM resolves that key
path at call time. If nothing is there, the call goes nowhere. GTM does not throw and does
not log — see [Installing the SDK](#installing-the-sdk) for how to guarantee ordering.

**"Still loading" is fine; "not there" is not.** Before `rsa.min.js` finishes loading,
`window.rudderanalytics` is a plain array — the SDK's pre-load buffer. This template
detects that and pushes onto the buffer, which the SDK replays once it is ready. An event
fired one millisecond after the loader is not lost.

## Installing the SDK

> [!IMPORTANT]
> **Install the SDK on the `Initialization - All Pages` trigger, not `All Pages`.**
>
> GTM fires the `Initialization` event before the `Page View` event, and every
> Initialization tag completes before any Page View tag starts. Within a *single* event,
> however, tag order is **not** guaranteed — there is no priority, no ordering, no
> promise.
>
> So if your SDK tag and your event tags are both on `All Pages`, your `page` tag can win
> the race, find no `window.rudderanalytics`, and send nothing. Earlier versions of this
> template then reported success anyway: GTM showed the tag as **Fired**, the console was
> clean, and no request left the browser — while the SDK finished loading moments later
> and looked perfectly healthy to every check you ran afterwards.
>
> This version reports a tag **failure** with a reason instead. The fix is still the same:
> use `Initialization - All Pages`.

### Method 1 — a load tag from this template

The recommended setup. No snippet to paste, no Custom HTML tag, and one less place for the
ordering mistake above to happen. It also matters for organisations that disable Custom
HTML tags in GTM for security review — a sandboxed template with a declared permission
manifest is then the only way tracking gets approved.

> [!WARNING]
> **Landing in the next release.** The `load` call is implemented but depends on a
> CDN-hosted loader artifact (`https://cdn.rudderlabs.com/js_sdk_loading_snippet/latest/loader.min.js`) that has not
> been published yet; it is being built and released from the
> [rudder-sdk-js](https://github.com/rudderlabs/rudder-sdk-js) monorepo. Until it ships,
> use [Method 2](#method-2--custom-html-tag).

1. In RudderStack, open your JavaScript source and copy its **write key** and
   **data plane URL**.
2. Create a tag from this template with **Call** set to `load`.
3. Fill in **Write key** and **Data plane URL**. Optionally point **Load options** at a
   JSON variable holding the SDK's
   [load options](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/load-js-sdk/).
4. Trigger it on **Initialization - All Pages**.

The tag creates `window.rudderanalytics` as an empty array if it is not already there,
pushes the `load` call onto it, and injects the loader. The loader performs the build-type
feature detection, method stubs, `globalThis` shim and polyfill branch that a GTM sandbox
cannot express, then loads the SDK, which replays the buffered call.

### Method 2 — Custom HTML tag

Use this when you want to hand-edit the loading snippet — pinning an SDK version, hosting
the SDK yourself, or setting load options that are easier to express in JavaScript than in
a GTM variable. It is also the only option until the loader artifact above ships.

1. In RudderStack, open your JavaScript source and copy its **write key** and
   **data plane URL**.
2. In GTM, create a **Custom HTML** tag and paste the loading snippet from the
   [JavaScript SDK quick start](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/quick-start-guide/).
   Copy it from the docs rather than from here — the snippet is versioned and changes
   between SDK releases. It looks like this:

   ```html
   <script>
     !function(){ /* … RudderStack loading snippet … */ }();
     rudderanalytics.load("<WRITE_KEY>", "<DATA_PLANE_URL>", {});
   </script>
   ```

3. Set its trigger to **Initialization - All Pages**. Not `All Pages`. See the note above.
4. Leave **Support document.write()** unchecked.

## Sending events

1. In your GTM workspace, go to **Templates** and add **RudderStack** from the Community
   Template Gallery.
2. Make sure the SDK is installed — see [above](#installing-the-sdk).
3. Create a tag from the template, pick a **Call**, fill in the fields shown for that call,
   and attach a trigger.

Each call maps directly onto a documented SDK API. The
[JavaScript SDK APIs](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/)
page is the reference for argument semantics; the [field reference](#field-reference) below
says which template field feeds which argument.

The tag reports failure to GTM, with a reason in the debug console, whenever it cannot
dispatch the call. See [Troubleshooting](#troubleshooting).

## Verifying your setup

Install the
[RudderStack Events Tracking Assistant](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/events-tracking-assistant/),
the official browser extension for Chrome and Firefox. Open it from DevTools (the
**RudderStack Assistant** panel) *before* reproducing the behaviour you want to check — it
does not capture events retroactively.

It answers both halves of a GTM setup in one place:

- **Did the SDK load?** The health view shows the SDK version, write key, data plane URL
  and installation type. If it reports no SDK, your loading tag did not run.
- **Did the event actually go out?** Every call is listed with its full payload and its
  delivery status, so a tag that GTM reports as *Fired* but that sent nothing is
  immediately visible.

Pair it with GTM Preview, which tells you whether the tag fired at all. Between them, the
"fired but nothing sent" failure has nowhere to hide. The extension requires JavaScript SDK
v3 or later.

## Requirements

The template targets **JavaScript SDK v3**. The three calls that the template has always
supported (`page`, `track`, `identify`) still work against v1.1, but nothing else does.

| Call | Minimum SDK version |
| --- | --- |
| `page`, `track`, `identify`, `group`, `alias`, `consent`, `startSession`, `endSession`, `setAnonymousId`, `setAuthToken` | 3.0.0 |
| `reset` (this template always sends `ResetOptions`, never the deprecated boolean) | 3.24.0 |
| `setCustomContext`, `clearCustomContext` | 3.32.0 |

## Field reference

**Call** picks the API method. Everything else is shown only for the calls it applies to.

### Event calls

| Field | Call | Required | Notes |
| --- | --- | --- | --- |
| Category | [`page`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#page) | no | Only sent as the page category when **Name** is also set. The SDK declares no overload that takes a category on its own — a lone string is reinterpreted as the name — so on its own it is sent as a page property instead. |
| Name | [`page`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#page) | no | Page name. |
| Use object action | [`track`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#track) | no | When `True`, the event name is `Object + " " + Action`, and `category`, `object` and `action` are added as properties. |
| Event | [`track`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#track) | yes, unless **Use object action** is `True` | Event name. |
| Object, Action | [`track`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#track) | yes, when **Use object action** is `True` | |
| User id | [`identify`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#identify) | no | Leave empty to update the current user's traits without changing their identity. |
| Group id | [`group`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#group) | no | Leave empty to update the current group's traits without changing it. |
| To | [`alias`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#alias) | yes | The new identifier. |
| From | [`alias`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#alias) | no | Previous identifier. Defaults to the current user id. |
| Default properties or traits | `page`, `track`, `identify`, `group` | no | A JSON object variable merged into every such call. It must return an **object** — a plain GTM variable such as `{{Event}}` returns a string and contributes nothing. |
| Custom properties or traits | `page`, `track`, `identify`, `group` | no | Per-tag key/value table. **Takes precedence over Default properties or traits.** |
| Options | `page`, `track`, `identify`, `group`, `alias` | no | A JSON object variable sent as the call's options argument: per-event `integrations` filtering, `anonymousId`, `originalTimestamp`, context overrides. |
| Suppress Google Analytics | `identify` | no | **Deprecated.** Emits `{integrations: {All: true, "Google Analytics": false}}`, which targets the deprecated Universal Analytics destination and has no effect on Google Analytics 4 (GA4). Use **Options** instead. An explicit **Options** value overrides it. |

### Identity and session calls

| Field | Call | Required | Notes |
| --- | --- | --- | --- |
| Reset options | [`reset`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#reset) | no | Nine checkboxes mapping to the SDK's `ResetOptions.entries`. Pre-set to the SDK's own defaults, so an untouched tag reproduces a plain `reset()`: user id, user traits, group id, group traits, session info and auth token on; anonymous id, initial referrer and initial referring domain off. |
| Anonymous id | [`setAnonymousId`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#anonymous-user-id) | yes | |
| Session id | [`startSession`](https://www.rudderstack.com/docs/sources/event-streams/sdks/session-tracking/manual-session-tracking/) | no | Must be numeric. Leave empty to let the SDK generate one. |
| Auth token | `setAuthToken` | yes | Not covered by the public JavaScript SDK documentation yet. |
| Custom context | [`setCustomContext`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#custom-context) | yes | A JSON object variable merged into the context of every subsequent event. |
| Consent options | [`consent`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/supported-api/#consent) | no | A JSON object variable holding the SDK's `ConsentOptions`. See [consent management](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/consent-management/). |

`endSession` and `clearCustomContext` take no fields.

### SDK loading

| Field | Call | Required |
| --- | --- | --- |
| Write key | [`load`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/load-js-sdk/) | yes |
| Data plane URL | [`load`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/load-js-sdk/) | yes |
| Load options | [`load`](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/load-js-sdk/) | no |

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

First check the trigger on your SDK tag. If it is `All Pages` rather than
`Initialization - All Pages`, that is almost certainly the cause — see the note in
[Installing the SDK](#installing-the-sdk).

Otherwise, open GTM Preview, switch the container to a debug environment and check the
browser console. The template logs a reason and reports a tag failure whenever it does not
dispatch a call:

| Console message | Cause | Fix |
| --- | --- | --- |
| `the "rudderanalytics" global was not found on this page` | The SDK is not on the page yet when this tag fires. | Move the SDK tag to an **Initialization - All Pages** trigger. |
| `unsupported Call value` | The **Call** field is empty or holds a value this template does not implement. | Pick a value from the dropdown. |
| `Event is required for the track call` | The **Event** field resolved to empty — often a GTM variable that returned nothing. | Check the variable in Preview. |
| `Object and Action are both required` | **Use object action** is `True` but one of them is empty. | Fill both, or set **Use object action** to `False`. |
| `To is required for the alias call` | | |
| `Anonymous id is required` / `Auth token is required` | | |
| `Custom context must be a JSON object variable` / `Consent options must be a JSON object variable` | The variable resolved to a string or to nothing. | Point the field at a variable that returns an object. |
| `Session id must be a number` | | Use a numeric timestamp. |
| `Write key and Data plane URL are both required` | A `load` tag is missing its credentials. | Copy both from your RudderStack source. |

If GTM reports the tag as **Fired** with no console message, the call was dispatched. Check
the [Events Tracking Assistant](#verifying-your-setup) or the Network tab for a request to
your data plane; if there is none, the problem is in the SDK's configuration rather than in
this tag.

### Every event carries a `defaultProp` or `defaultTrait` key

**Default properties or traits** must point at a variable that returns an **object**. When
it returns a string or nothing, it contributes nothing to the call — `{{Event}}` and
`{{Page URL}}` are common mistakes. Use a Custom JavaScript variable that returns an
object, for example:

```js
function () {
  return {
    page_location: {{Page URL}},
    page_title: {{Page Title}}
  };
}
```

### A tag-specific value is being overwritten

**Custom properties or traits** takes precedence over **Default properties or traits**. If
you are seeing the opposite, the container is still on an older version of this template —
accept the update prompt in GTM.

### The `group` call does nothing

`group` is implemented from version 2.0.0 onward. In earlier versions it appeared in the
dropdown with no implementation behind it, so selecting it fired nothing and still reported
success. Accept the update prompt in GTM.

## Manual import

1. Download
   [template.tpl](https://raw.githubusercontent.com/rudderlabs/rudderstack-gtm-template/main/template.tpl).
2. In your GTM workspace, go to **Templates**.
3. Click **New** in the **Tag Templates** section.
4. Click **Import** from the right menu bar.
5. Select the downloaded file and save.

An imported template is local to that workspace and is never published to the Community
Template Gallery, which makes this the way to test changes before they ship.

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
  shipping in the dropdown with no permission entry.
- **Field-model lint** — every `call` dropdown value has a code branch, every
  `enablingConditions` chain references a field that exists, and every field name the
  template has ever shipped still exists.

The `___TESTS___` block inside `template.tpl` mirrors the harness for the GTM editor's test
tab. It is a convenience, not the source of truth.

Two things the harness cannot check, because Node is not GTM: how GTM marshals values
across `callInWindow`, and how its runtime validates the permission manifest. Verify those
in a GTM preview container before publishing.

### Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please),
driven by [Conventional Commits](https://www.conventionalcommits.org/).

Merging to `main` opens or updates a release PR carrying everything the release needs: the
changelog, the version bump, and the Community Template Gallery entry — the `main` commit's
SHA prepended to the `versions` list in `metadata.yaml`. Merging that release PR *is* the
publish; there is no follow-up commit on `main`. Google then reads the `template.tpl` found
at that SHA, which is correct because the release PR itself never touches `template.tpl`.

The Gallery serves the new version within two to three days, and template users are prompted
in GTM to accept the update — nothing auto-updates.

## Contact us

If you come across any issue, start a conversation on our
[Slack](https://resources.rudderstack.com/join-rudderstack-slack) channel.
