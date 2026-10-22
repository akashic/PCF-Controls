# William Buck PCF Controls

The long-term home for every Power Apps Component Framework (PCF) control built for William Buck projects. The controls run in Dataverse model-driven apps and are deployed through dev → UAT → prod.

This README is the standard for building and shipping a WB control: conventions, toolchain, the development loop, packaging, versioning and deployment. Each control's own `README.md` covers what that control does and how to configure it.

> **Moving to the enterprise org:** this repo will move from `akashic/PCF-Controls` to the **William-Buck-Australia** enterprise org. Nothing in the code depends on the org name. See [Moving to William-Buck-Australia](#moving-to-william-buck-australia).

## Control catalogue

| Control | Type | Solution | Logical name | Status | Docs |
|---|---|---|---|---|---|
| GridFormatter | Power Apps grid customizer (views and subgrids) | `WBGridFormatter` | `wb_WB.GridFormatter` | Planned | [brief](docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md) |
| RagChoice | Field control (single-select choice) | `WBRagChoice` | `wb_WB.RagChoice` | In development | [README](controls/RagChoice/README.md) |

Update this table when a control is added, released or retired.

## Repository layout

```
.
├── README.md                     # this standard
├── CLAUDE.md                     # guidance for AI coding agents
├── package.json                  # npm workspaces root (packages/*, controls/*)
├── jest.config.base.js           # shared Jest settings, spread by each workspace's jest.config.js
├── controls/
│   └── <ControlName>/            # one folder per control = one PCF project = one npm workspace
│       ├── README.md             # what it does, configuration, per-table/per-form setup, changelog
│       ├── package.json          # "name": "@wb-pcf/<control-name>", "version" = control version
│       ├── <ControlName>.pcfproj
│       ├── pcfconfig.json  tsconfig.json  eslint.config.mjs
│       ├── <ControlName>/        # ControlManifest.Input.xml, index.ts, components, logic
│       ├── tests/                # Jest tests for the control's pure logic
│       ├── docs/                 # optional: decisions.md (spike outcomes), configuration.md
│       └── solution/             # WB<ControlName>.cdsproj + src/Other/Solution.xml
├── packages/
│   └── shared/                   # code shared between controls (bundled into each control)
├── docs/
│   ├── adr/                      # architecture decisions for the whole repo
│   ├── briefs/                   # build briefs from the product owner, one per piece of work
│   └── agents/                   # config for the agent skills (issue tracker, labels)
├── scripts/check-controls.mjs    # conventions check run in CI
└── .github/workflows/            # ci.yml (every PR), release.yml (tags)
```

Why this layout: [ADR-0001](docs/adr/0001-one-solution-per-control.md) (one solution per control), [ADR-0002](docs/adr/0002-npm-workspaces-monorepo.md) (npm workspaces and shared code), [ADR-0003](docs/adr/0003-wb-publisher.md) (publisher).

## Conventions

| Item | Convention | Example |
|---|---|---|
| Publisher | Unique name `WilliamBuck`, display name `William Buck`, prefix `wb`, option value prefix `94879` | — |
| PCF namespace | `WB` | — |
| Control constructor | PascalCase, describes the job rather than the project | `GridFormatter` |
| Control logical name | `wb_WB.<ControlName>` | `wb_WB.RagChoice` |
| Folder | `controls/<ControlName>/` | `controls/RagChoice/` |
| Solution unique name | `WB<ControlName>` | `WBRagChoice` |
| npm workspace name | `@wb-pcf/<kebab-case-name>` | `@wb-pcf/rag-choice` |
| Environment variables | `wb_<ControlName><Purpose>`, inside the control's solution | `wb_GridFormatConfig` |
| Release tag | `<ControlName>-v<major.minor.patch>` | `GridFormatter-v1.0.0` |

Controls are built to be reusable across projects: **no hard-coded table names, column names, option values or colours**. Anything that varies goes in manifest input properties (set per form or view) or in an environment variable (set per environment).

## Prerequisites

Everything builds on macOS (Apple Silicon) and Windows 11. Only Node, the .NET SDK and `pac` need to be installed globally. Versions this repo is tested with:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS (see `.nvmrc`) | npm 11+ |
| .NET SDK | 10.0 | Needed for `pac` and for `dotnet build` of solutions |
| Power Platform CLI (`pac`) | 2.14.1 | Installed as a .NET global tool |
| VS Code | current | With the **Power Platform Tools** extension |

### Install `pac` on macOS

```sh
dotnet tool install --global Microsoft.PowerApps.CLI.Tool
```

The dotnet installer's `/etc/paths.d` entry uses a literal `~`, which macOS doesn't expand, so `pac` often isn't on the PATH. Add this to `~/.zprofile`, then open a new terminal:

```sh
export PATH="$PATH:$HOME/.dotnet/tools"
```

Check the install with `pac help` (the second line shows the version). Update later with `dotnet tool update --global Microsoft.PowerApps.CLI.Tool`.

On Windows, use the same `dotnet tool install` command (the global tools folder is already on the PATH) or the Power Platform Tools VS Code extension.

### First-time setup

```sh
npm ci                     # one install at the root covers every control and package
pac auth create --name wb-dev --environment https://<dev-org>.crm6.dynamics.com
```

## Development

All commands below run from the repo root unless noted.

| Task | Command |
|---|---|
| Lint / test / build everything | `npm run lint` · `npm test` · `npm run build` |
| One control | `npm run build -w @wb-pcf/<name>` (same for `lint`, `test`) |
| A single test file | `npm test -w @wb-pcf/<name> -- tests/<file>.test.ts` |
| Test harness (field and dataset controls) | `npm run start:watch -w @wb-pcf/<name>` |
| Conventions check | `npm run check:controls` |
| Fast deploy to **dev only** | `cd controls/<ControlName> && pac pcf push --publisher-prefix wb` |
| Build solution zips | `dotnet build controls/<ControlName>/solution -c Release` |

- **The local test harness** is good for field controls. It can't meaningfully host a grid customizer, so test those in the dev environment.
- **`pac pcf push`** wraps the control in a temporary `PowerAppsTools_wb` solution. Use it in dev only, never as a way to ship. In a new environment, import a real solution (or create the `WilliamBuck` publisher by hand) **before** the first push, otherwise the push may create a mismatched `wb` publisher.
- **Solution builds** write `WB<ControlName>.zip` (unmanaged) and `WB<ControlName>_managed.zip` to `controls/<ControlName>/solution/bin/Release/`.

## Adding a new control

1. **Write a brief** in `docs/briefs/` (or a GitHub issue) and agree it with the product owner. Use `docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md` as the model: requirements, decisions, platform facts, open **VERIFY** items, test matrix, and things not to do.
2. **Create the PCF project.** Pick the template that fits: `field`, `dataset`, or (for grid customizers) a copy of Microsoft's [`GridCustomizerControlTemplate`](https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework/resources/GridCustomizerControlTemplate).
   ```sh
   mkdir controls/<ControlName> && cd controls/<ControlName>
   pac pcf init --namespace WB --name <ControlName> --template field --framework react --run-npm-install false
   ```
   Then make it work as an npm workspace ([ADR-0002](docs/adr/0002-npm-workspaces-monorepo.md) explains why):
   - `package.json`: set `"name": "@wb-pcf/<kebab-name>"`, `"private": true`, and `"version"` to match the manifest (start at `0.1.0`). Add `"@wb-pcf/shared": "*"` to `dependencies` if the control uses shared code, and add a `"test": "jest"` script with a `jest.config.js` that spreads `../../jest.config.base`.
   - `tsconfig.json`: `"extends": "pcf-scripts/tsconfig_base.json"` and `"typeRoots": ["../../node_modules/@types"]`.
   - `<ControlName>.pcfproj`: add `<PcfEnableAutoNpmInstall>false</PcfEnableAutoNpmInstall>` to the first `<PropertyGroup>` that sets `OutputPath`.
   - `package.json`: set `"lint": "pcf-scripts refreshTypes && pcf-scripts lint"`. The generated manifest types aren't committed, so lint fails on a fresh checkout without `refreshTypes`.
   - Delete the generated `.gitignore` (the root one covers it). Never commit a `package-lock.json` inside a control folder.
3. **Create the solution** and point it at the control:
   ```sh
   mkdir solution && cd solution
   pac solution init --publisher-name WilliamBuck --publisher-prefix wb
   pac solution add-reference --path ..
   ```
   Then:
   - Rename the `.cdsproj` and `<UniqueName>` to `WB<ControlName>`, and set the display name.
   - Set the publisher's display name to `William Buck` and **replace the random `CustomizationOptionValuePrefix` with `94879`**.
   - Set the solution `<Version>` to `<x.y.z>.0`, matching the manifest.
   - In the `.cdsproj`, uncomment the `SolutionPackageType` property group and set it to `Both`.
4. **Write `controls/<ControlName>/README.md`:** what the control does, its manifest properties, any environment variables, how to add it to a form or view, known limitations, and a changelog.
5. **Add the control to the catalogue** above, then run `npm install` (to register the workspace) and `npm run check:controls`.

## PCF development standards

### Platform and framework

- **Build virtual (React) controls.** Set `control-type="virtual"` and declare React and Fluent as `<platform-library>` resources so the platform supplies them at runtime. **Never bundle React or Fluent.** In a virtual control, `init` gets no container and `updateView` returns a `ReactElement`.
- **Prefer Fluent 9** so controls pick up the app's modern theme and dark mode automatically. Fluent 8 and 9 can't both be declared in one manifest. Keep `package.json` versions aligned with the declared platform library versions, and don't use APIs newer than what's declared.
- **Declared platform library versions:** declare `React 16.14.0` and `Fluent 9.46.2`, and pin `"@fluentui/react-components": "9.46.2"` (exact) in `devDependencies`. `pac` 2.14.1 generates `9.68.0`, so change it in the manifest and `package.json` after `pac pcf init`. Microsoft Learn's [supported platform libraries list](https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries#supported-platform-libraries-list) allows `>=9.4.0 <=9.46.2` and loads `9.68.0` at runtime. `pcf-scripts` 1.49.3+ also builds `9.68.0`, but Learn doesn't document it. Revisit when Learn raises the range. Sources and reasoning: [docs/research/fluent-platform-library-version.md](docs/research/fluent-platform-library-version.md).
- Use `pac` 2.14+ (virtual controls need at least 1.37).
- Keep `<external-service-usage enabled="false">` unless the control genuinely calls an external service. Declaring one makes the control premium-licensed.

### Behaviour

- **Fail soft.** A control must never throw into the host. On a bad config, missing metadata or a failed request, log one `console.warn` and fall back to the platform's default behaviour.
- **No network calls in `updateView` or render paths.** Load data once in `init`, cache it at module scope (so several instances on a page share it), and re-render when it arrives.
- **Respect the platform state:** `context.mode.isControlDisabled` (read-only forms, inactive records, business-rule locks) and field security (`context.parameters.<prop>.security`). Show `***` when a field isn't readable. The form renders the label and required-level indicator, not the control.
- **Field controls:** sync from `context.parameters.<prop>.raw` in every `updateView` (values change through business rules, JavaScript and refreshes). Call `notifyOutputChanged()` only for user-driven changes.
- **Grid customizers:** there's one customizer per grid, so one control has to cover every formatting need through configuration. Renderers must be pure, lightweight and idempotent, and must never mutate grid data or metadata. Don't override cell editors unless that's the point of the control.
- **Mobile:** desktop is the main target, but the mobile app must never crash. Degrading to no customisation is acceptable.
- **Configuration** that varies per environment goes in a Dataverse environment variable in the control's solution, with a safe default value. Validate it with a JSON Schema in the repo (CI checks the example and per-environment files) and re-validate at runtime. Skip invalid parts with a warning rather than failing the whole control.

### Theming and accessibility

- Use Fluent theme tokens for any colour that isn't meaningful data, so dark mode works. Data colours (for example, choice option colours) don't adapt by themselves: use low-alpha tints, pick black or white text by WCAG contrast on solid fills, and border small swatches.
- **Colour is never the only signal.** Keep the text visible, make decorative elements `aria-hidden="true"`, and keep a minimum 4.5:1 contrast for any text a control draws.
- Keyboard behaviour must match the standard Fluent component being replaced.

### Code quality

- Keep logic in **pure functions** (evaluators, resolvers, formatters) that are separate from React and the PCF context, and unit-test them with Jest. The harness and dev environment are for integration and visual checks.
- Lint with the template's ESLint config (`@microsoft/eslint-plugin-power-apps`).
- This is a managed corporate environment: **any npm package beyond what the Microsoft templates use needs approval.** List it in the PR description with its purpose and bundle cost.
- **Prove platform unknowns with a spike before building on them.** Record what was tested, the result and the chosen approach in `controls/<ControlName>/docs/decisions.md`, with screenshots in light and dark mode where it's visual.

## Versioning and releases

Each control has its own [semantic version](https://semver.org/), and it must match in three places (CI enforces this):

1. `version` on the `<control>` element in `ControlManifest.Input.xml` (`x.y.z`)
2. `version` in the control's `package.json` (`x.y.z`)
3. `<Version>` in `solution/src/Other/Solution.xml` (`x.y.z.0`)

**Bump the manifest version on every deployment**, even in dev. Dataverse caches control bundles by version, and an unchanged version can leave the old bundle running.

To release:

1. Merge to `main` with all three versions bumped and the control's changelog updated.
2. Tag the merge commit: `git tag GridFormatter-v1.2.0 && git push origin GridFormatter-v1.2.0`.
3. `release.yml` checks that the tag matches the versions, lints, tests, builds the solution, and publishes a GitHub Release with the managed and unmanaged zips attached.

## Deployment

| Environment | What gets imported | How |
|---|---|---|
| Dev | Unmanaged solution (or `pac pcf push` while iterating) | `pac solution import --path WB<Name>.zip` |
| UAT, prod | **Managed** solution from a GitHub Release, never an unmanaged one | `pac solution import --path WB<Name>_managed.zip --settings-file <env>.json` |

- **Environment variables:** generate a deployment settings template once with `pac solution create-settings --solution-zip WB<Name>_managed.zip --settings-file settings.json`, then keep one settings file per environment (for example `controls/<Name>/config/environments/uat.json`). Never edit configuration directly in UAT or prod.
- **Using a control:** adding a control to a form field, view or subgrid is a customisation of that *table*, so it belongs to the project solution that owns the table, not to the control's solution. Document the exact steps in the control's README.
- **Order:** import the control's solution before any project solution that references it.
- **Deployment is manual for now.** CI builds and tests; it doesn't deploy. Pipeline automation can be added later (see [CI](#ci)).

## CI

`.github/workflows/ci.yml` runs on every PR and every push to `main`:

1. Checks the conventions (`scripts/check-controls.mjs`: publisher, version alignment).
2. Runs `npm ci`, lint and test across all workspaces.
3. Builds the solution for each **changed** control, and uploads the zips as workflow artifacts. Changes to `packages/`, root tooling or workflows rebuild every control.

## Moving to William-Buck-Australia

When the repo moves to the enterprise org:

- Transfer the repo (or push to a new repo and archive this one). Issues, labels and releases come across with a transfer.
- Allow GitHub Actions (with GitHub-hosted Ubuntu runners) for the repo. If the org only allows approved actions, approve `actions/checkout`, `actions/setup-node`, `actions/setup-dotnet` and `actions/upload-artifact`.
- Add branch protection on `main`: require PRs, a passing CI, and review. Add a `CODEOWNERS` file naming the Power Platform team.
- Update clone URLs in local checkouts with `git remote set-url origin https://github.com/William-Buck-Australia/<repo>.git`.

## References

- PCF overview: https://learn.microsoft.com/power-apps/developer/component-framework/overview
- React controls and platform libraries: https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries
- Modern theming: https://learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming
- Grid customizer: https://learn.microsoft.com/power-apps/developer/component-framework/customize-editable-grid-control
- `pac pcf`: https://learn.microsoft.com/power-platform/developer/cli/reference/pcf
- `pac solution`: https://learn.microsoft.com/power-platform/developer/cli/reference/solution
- Microsoft PCF samples: https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework
