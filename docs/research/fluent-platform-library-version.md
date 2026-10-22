# Declared Fluent 9 platform library version

- **Question:** which Fluent 9 version should WB controls declare in `<platform-library name="Fluent" version="…" />`, and which `@fluentui/react-components` version goes in `package.json`? (Issue #3.)
- **Checked:** 2026-10-22, primary sources only.
- **Answer:** declare **`9.46.2`** and pin **`"@fluentui/react-components": "9.46.2"`** (exact, in `devDependencies`). After `pac pcf init`, change the generated `9.68.0` to `9.46.2` in both the manifest and `package.json`. Declare React `16.14.0` as generated.

## What each source says

| Source | Fluent 9 version | Notes |
|---|---|---|
| Learn, [React controls & platform libraries](https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries#supported-platform-libraries-list) (`ms.date` 10/10/2025) | Allowed range `>=9.4.0 <=9.46.2`. Version loaded `9.68.0`. | "The highest currently supported versions." The example manifest declares `9.46.2`. |
| Learn, [platform-library element](https://learn.microsoft.com/power-apps/developer/component-framework/manifest-schema-reference/platform-library) | Example declares `9.46.2` | `version` is "the current version of the platform library". No range is stated. |
| Learn, [Style components with modern theming](https://learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming#fluent-ui-v9-controls) | Example declares `9.46.2` | Fluent 9 controls get the app theme automatically through the platform provider. |
| [`pcf-scripts` 1.51.1](https://www.npmjs.com/package/pcf-scripts) `PlatformLibraryVersions.json` | Accepts `9.0.0`–`9.68.0` | 1.37.4–1.48.2 accept only up to `9.46.2`. 1.49.3 (6 Oct 2025) raised it to `9.68.0`. The README release notes say "Update Fluent v9 platform library from 9.46.2 to 9.68.0". |
| `pac pcf init --framework react` (`pac` 2.14.1, run 2026-10-22, field and dataset templates) | Declares `9.68.0` | `package.json` has `"@fluentui/react-components": "9.68.0"` in `dependencies` and `"pcf-scripts": "^1"`. |
| [PowerApps-Samples `FluentThemingAPIControl`](https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework/FluentThemingAPIControl) (last changed 2026-10-13) | Declares `9.4.0` | Its `package.json` uses `@fluentui/react-components` `9.46.2`. |
| PowerApps-Samples [`GridCustomizerControlTemplate`](https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework/resources/GridCustomizerControlTemplate) and the other React samples | Declare Fluent 8 `8.121.1` | A code search of the repo found six manifests that declare Fluent. Only `FluentThemingAPIControl` declares Fluent 9. |

The Learn page history ([MicrosoftDocs/powerapps-docs commit `900bfee`](https://github.com/MicrosoftDocs/powerapps-docs/commit/900bfee), 10 Oct 2025) changed only the "Version loaded" cell from `9.46.2` to `9.68.0`. The allowed range stayed at `<=9.46.2`. That edit landed four days after `pcf-scripts` 1.49.3 started accepting `9.68.0`.

## How the declared version is used

From the `pcf-scripts` 1.51.1 source (`platformLibrariesHandler.js` and `PlatformLibraryVersions.json`):

- The build fails with "Unsupported 'fluent' version '…' specified platform-library" if the declared version is outside the table's range.
- Every Fluent 9 version from `9.0.0` to `9.68.0` maps to the **same** external (`FluentUIReactv940`, static file `fluent_9_4_0`). The declared version doesn't select a different runtime file. The platform supplies whatever Fluent 9 it loads (`9.68.0` in model-driven apps today, per Learn).
- So the declared version is a build-time gate and a statement of the oldest API surface the control relies on. It's not a request for a specific runtime build.

## Recommendation

**Declare `9.46.2`** because the sources disagree and it's the only option that every source supports:

- It's inside Learn's documented allowed range, and every Learn example uses it.
- Every `pcf-scripts` version since 1.37 accepts it.
- Model-driven apps load `9.68.0`, a later minor version of the same major, so code written against `9.46.2` runs on it.

**Declaring `9.68.0` (the `pac` default) works but isn't documented.** `pcf-scripts` 1.49.3+ builds it, and the runtime file is the same, so it probably behaves the same today. But Learn hasn't listed it as supported, and it invites using APIs from 9.47–9.68. Those would break anywhere the platform still loads an older Fluent 9. Nobody has tested a 9.68.0 manifest through solution import here. Revisit when Learn raises the allowed range.

**`package.json`:** `"@fluentui/react-components": "9.46.2"`, exact, in `devDependencies`. It's only for types and the test harness, because `pcf-scripts` treats it as an external. Note that the 9.46.2 umbrella package depends on its sub-packages with caret ranges (for example `@fluentui/react-menu ^9.12.48`), so `npm` can resolve newer sub-packages. The pin removes components added after 9.46.2 but doesn't hide every newer prop. Check the [Fluent UI changelog](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-components/CHANGELOG.md) before relying on anything that looks recent.

## What this means for GridFormatter

- Microsoft's grid customizer template declares Fluent 8 `8.121.1`, but its code imports only `react`, not Fluent. Switching the GridFormatter to Fluent 9 is a manifest and `package.json` change, not a port. (Microsoft's fuller `PowerAppsGridCustomizerControl` sample does import `Label` from Fluent 8.)
- Fluent 8 and Fluent 9 can't both be declared in one manifest (Learn, platform libraries page).
- Fluent 9 is what gets the app theme automatically. Fluent 8 needs `createV8Theme` from `@fluentui/react-migration-v8-v9`, which is an extra package (Learn, modern theming page).
- Plan: GridFormatter declares Fluent `9.46.2`, the same as RagChoice. Whether Fluent 9 elements and theme tokens work inside the Power Apps grid is still the brief's §3.1/§3.4 **VERIFY**, tested in issue #9. Fall back to Fluent 8 `8.121.1` only if that spike shows Fluent 9 doesn't work in the grid, and record the outcome in `controls/GridFormatter/docs/decisions.md`.

## Out of scope

- React: Learn documents only `16.14.0` declared (17.0.2 loaded in model-driven apps). `pcf-scripts` 1.51.1 also lists React `18.3.1` behind a feature flag (`pcfReactPlatformLibraries`). That's undocumented on Learn, so keep declaring `16.14.0`.
