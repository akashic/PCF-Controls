# William Buck PCF Controls

The long-term home for every Power Apps Component Framework (PCF) control built for William Buck projects, and for the Dataverse plug-ins that go with them. The controls run in Dataverse model-driven apps, and everything is deployed through dev → UAT → prod.

This README is the standard for building and shipping a WB control or plug-in: conventions, toolchain, the development loop, packaging, versioning and deployment. Each control's or plug-in's own `README.md` covers what it does and how to configure it.

> **Moving to the enterprise org:** this repo will move from `akashic/PCF-Controls` to the **William-Buck-Australia** enterprise org. Nothing in the code depends on the org name. See [Moving to William-Buck-Australia](#moving-to-william-buck-australia).

## Control catalogue

| Control | Type | Solution | Logical name | Status | Docs |
|---|---|---|---|---|---|
| GridFormatter | Power Apps grid customizer (views and subgrids) | `WBGridFormatter` | `wb_Controls.GridFormatter` | In development | [README](controls/GridFormatter/README.md) |
| RagChoice | Field control (single-select choice) | `WBRagChoice` | `wb_Controls.RagChoice` | In development | [README](controls/RagChoice/README.md) |
| ChoiceCounts | Field control (counts of related rows per choice option) | `WBChoiceCounts` | `wb_Controls.ChoiceCounts` | In development | [Brief](docs/briefs/2026-10-31-choice-counts.md) |

Update this table when a control is added, released or retired.

### Plug-in catalogue

| Plug-in | What it does | Solution | Status | Docs |
|---|---|---|---|---|
| WBCodeFYName | Sets the WBCodeFY primary name from the WBCode and FY lookups (synchronous PreOperation) | `WBWBCodeFYName` | Briefed | [Brief](docs/briefs/2026-10-31-wbcodefy-name-plugin.md) |

Update this table when a plug-in is added, released or retired. See [Plug-ins](#plug-ins) for how they're built.

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
├── plugins/
│   └── <Name>/                   # one folder per Dataverse plug-in = one solution (ADR-0006)
│       ├── README.md             # what it does, project prerequisites, step configuration, changelog
│       ├── <Name>/               # <Name>.csproj (net48, signed), <Name>.snk, plug-in classes
│       ├── tests/                # MSTest project (net10.0)
│       ├── config/               # JSON Schema for the step configuration, plus examples
│       ├── scripts/              # registration script (Web API, dev only)
│       ├── docs/decisions.md     # spike outcomes
│       └── solution/             # WB<Name>.cdsproj + src/ (registration synced from dev)
├── packages/
│   └── shared/                   # code shared between controls (bundled into each control)
├── docs/
│   ├── adr/                      # architecture decisions for the whole repo
│   ├── briefs/                   # build briefs from the product owner, one per piece of work
│   └── agents/                   # config for the agent skills (issue tracker, labels)
├── scripts/check-controls.mjs    # conventions check for controls and plug-ins, run in CI
├── tools/Sync-FromUpstream.ps1   # merges this repo's updates into a copy of it (PowerShell 7)
└── .github/workflows/            # ci.yml (every PR), release.yml (tags)
```

Why this layout: [ADR-0001](docs/adr/0001-one-solution-per-control.md) (one solution per control), [ADR-0002](docs/adr/0002-npm-workspaces-monorepo.md) (npm workspaces and shared code), [ADR-0003](docs/adr/0003-wb-publisher.md) (publisher), [ADR-0006](docs/adr/0006-plugins-folder.md) (plug-ins).

## Conventions

| Item | Convention | Example |
|---|---|---|
| Publisher | Unique name `WilliamBuck`, display name `William Buck`, prefix `wb`, option value prefix `94879` | — |
| PCF namespace | `Controls` | — |
| Control constructor | PascalCase, describes the job rather than the project | `GridFormatter` |
| Control logical name | `wb_Controls.<ControlName>` | `wb_Controls.RagChoice` |
| Folder | `controls/<ControlName>/` | `controls/RagChoice/` |
| Solution unique name | `WB<ControlName>` | `WBRagChoice` |
| npm workspace name | `@wb-pcf/<kebab-case-name>` | `@wb-pcf/rag-choice` |
| Environment variables | `wb_<ControlName><Purpose>`, inside the control's solution | `wb_GridFormatterApiUrl` (hypothetical) |
| Release tag | `<ControlName>-v<major.minor.patch>` | `GridFormatter-v1.0.0` |
| Plug-in folder, solution, tag | `plugins/<Name>/`, `WB<Name>`, `<Name>-v<x.y.z>` (a plug-in can't share a control's name) | `plugins/WBCodeFYName/`, `WBWBCodeFYName` |

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
pac auth create --name wb-dev --environment https://<dev-org>.crm<N>.dynamics.com
```

The `crm<N>` region number depends on where the environment lives (for example, `crm6` is Australia). Copy the URL from the Power Platform admin center.

## Development

All commands below run from the repo root unless noted.

| Task | Command |
|---|---|
| Lint / test / build everything | `npm run lint` · `npm test` · `npm run build` |
| One control | `npm run build -w @wb-pcf/<name>` (same for `lint`, `test`) |
| A single test file | `npm test -w @wb-pcf/<name> -- tests/<file>.test.ts` |
| Test harness (field and dataset controls) | `npm run start:watch -w @wb-pcf/<name>` |
| Conventions check | `npm run check:controls` |
| Validate config files against their JSON Schemas | `npm run validate:config` |
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
   pac pcf init --namespace Controls --name <ControlName> --template field --framework react --run-npm-install false
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
- **No apostrophes in manifest `*-key` attributes** (`display-name-key`, `description-key`). Solution import rejects them. `npm run check:controls` catches it.

### Behaviour

- **Fail soft.** A control must never throw into the host. On a bad config, missing metadata or a failed request, log one `console.warn` and fall back to the platform's default behaviour.
- **No network calls in `updateView` or render paths.** Load data once in `init`, cache it at module scope (so several instances on a page share it), and re-render when it arrives.
- **Respect the platform state:** `context.mode.isControlDisabled` (read-only forms, inactive records, business-rule locks) and field security (`context.parameters.<prop>.security`). Show `***` when a field isn't readable. The form renders the label and required-level indicator, not the control.
- **Field controls:** sync from `context.parameters.<prop>.raw` in every `updateView` (values change through business rules, JavaScript and refreshes). Call `notifyOutputChanged()` only for user-driven changes.
- **Grid customizers:** there's one customizer per grid, so one control has to cover every formatting need through configuration. Renderers must be pure, lightweight and idempotent, and must never mutate grid data or metadata. Don't override cell editors unless that's the point of the control.
- **Mobile:** desktop is the main target, but the mobile app must never crash. Degrading to no customisation is acceptable.
- **Configuration** that varies per environment goes in a Dataverse environment variable in the control's solution, with a safe default value. Validate it with a JSON Schema in the repo (CI checks the examples) and re-validate at runtime. The per-environment values belong to the deploying project, not this repo (see [Deployment](#deployment)). Skip invalid parts with a warning rather than failing the whole control.

### Theming and accessibility

- Use Fluent theme tokens for any colour that isn't meaningful data, so dark mode works. Data colours (for example, choice option colours) don't adapt by themselves: use low-alpha tints, pick black or white text by WCAG contrast on solid fills, and border small swatches.
- **Colour is never the only signal.** Keep the text visible, make decorative elements `aria-hidden="true"`, and keep a minimum 4.5:1 contrast for any text a control draws.
- Keyboard behaviour must match the standard Fluent component being replaced.

### Code quality

- Keep logic in **pure functions** (evaluators, resolvers, formatters) that are separate from React and the PCF context, and unit-test them with Jest. The harness and dev environment are for integration and visual checks.
- Lint with the template's ESLint config (`@microsoft/eslint-plugin-power-apps`).
- This is a managed corporate environment: **any npm package beyond what the Microsoft templates use needs approval.** List it in the PR description with its purpose and bundle cost.
- **Prove platform unknowns with a spike before building on them.** Record what was tested, the result and the chosen approach in `controls/<ControlName>/docs/decisions.md`, with screenshots in light and dark mode where it's visual.

## Plug-ins

Dataverse plug-ins live in `plugins/<Name>/` with their own `WB<Name>` solution ([ADR-0006](docs/adr/0006-plugins-folder.md)). They share the controls' publisher, naming, release tags and "configuration, not code" rule. Only the .NET SDK is needed on macOS: no Visual Studio, no Windows.

### Adding a plug-in

1. **Write a brief** in `docs/briefs/`, as for a control. Use `docs/briefs/2026-10-31-wbcodefy-name-plugin.md` as the model.
2. **Create the project** in a subfolder, so the tests aren't compiled into the assembly:
   ```sh
   mkdir -p plugins/<Name>/<Name> && cd plugins/<Name>/<Name>
   pac plugin init        # SDK-style net48, signed with a generated <Name>.snk (commit it)
   ```
   - `<Name>` becomes the namespace, so it must be a valid C# identifier (no hyphens).
   - Delete the template's `Plugin1.cs`, and name classes after the step (e.g. `SetPrimaryName`), never after the namespace.
   - Set `<AssemblyVersion>1.0.0.0</AssemblyVersion>` permanently, and `<FileVersion>0.1.0.0</FileVersion>`.
   - Pin the template's floating package versions, as the controls do.
3. **Add a test project** in `plugins/<Name>/tests/`: MSTest, `net10.0`, referencing `../<Name>/<Name>.csproj`, with hand-written fakes of the `Microsoft.Xrm.Sdk` interfaces. The test packages need sign-off in the PR.
4. **Put logical names in step configuration**, never in code. Add `config/step-config.schema.json` with an example, and validate the configuration again in the plug-in's constructor.
5. **Register in dev** with a Web API script in `scripts/`, then create the solution and bring the registration into source:
   ```sh
   cd plugins/<Name> && mkdir solution && cd solution
   pac solution init --publisher-name WilliamBuck --publisher-prefix wb   # then fix the publisher as for a control
   # in dev: add the assembly and its steps to WB<Name>, then
   pac solution sync
   pac solution add-reference --path ../<Name>
   ```
   From then on, `dotnet build plugins/<Name>/solution -c Release` builds both zips on macOS and in CI.
6. **Write `plugins/<Name>/README.md`:** what it does, its steps, the step configuration, project prerequisites (alternate keys, form settings, security roles), known limitations and a changelog. Add a row to the [plug-in catalogue](#plug-in-catalogue), then run `npm run check:controls`.

### Plug-in standards

- **Keep logic in pure static classes** (rules, configuration parsing). `Execute` stays thin and is tested through fakes.
- **PreOperation sets `Target` directly.** Never call `Update` on the row being saved, and don't add a blanket `context.Depth` guard.
- **Fail closed:** a plug-in that guards data integrity blocks the save with an `InvalidPluginExecutionException`, unlike a control, which fails soft. User-facing messages say what to fix. Details go to the trace log, never client data such as TFNs, dates of birth or tokens.
- **Run as the calling user** unless the brief says otherwise. Elevated execution needs a security review.
- **Versions:** `FileVersion` (`x.y.z.0`) and `Solution.xml` `<Version>` must match. `AssemblyVersion` never changes.
- **Import order:** the project solution that owns the table first, then `WB<Name>`.

## Versioning and releases

Each control has its own [semantic version](https://semver.org/), and it must match in three places (CI enforces this). For plug-ins it's two places: `<FileVersion>` in the csproj (`x.y.z.0`) and `Solution.xml` ([Plug-ins](#plug-ins)):

1. `version` on the `<control>` element in `ControlManifest.Input.xml` (`x.y.z`)
2. `version` in the control's `package.json` (`x.y.z`)
3. `<Version>` in `solution/src/Other/Solution.xml` (`x.y.z.0`)

**Bump the manifest version on every deployment**, even in dev. Dataverse caches control bundles by version, and an unchanged version can leave the old bundle running.

To release:

1. Merge to `main` with all three versions bumped and the control's changelog updated.
2. Tag the merge commit: `git tag GridFormatter-v1.2.0 && git push origin GridFormatter-v1.2.0`.
3. `release.yml` fails unless the tagged commit is on `main`. It checks that the tag matches the versions, lints, tests, validates the config files, builds the solution, and publishes a GitHub Release with the managed and unmanaged zips attached. For a plug-in tag it also builds and tests the plug-in. The release notes start from the same control's (or plug-in's) previous tag, so they list only changes since its last release.

The build and the publish are separate jobs: the build job has read-only access to the repo and uploads the zips, and only the publish job (which just runs `gh release create`) can write.

## Deployment

| Environment | What gets imported | How |
|---|---|---|
| Dev | Unmanaged solution (or `pac pcf push` while iterating) | `pac solution import --path WB<Name>.zip` |
| UAT, prod | **Managed** solution from a GitHub Release, never an unmanaged one | `pac solution import --path WB<Name>_managed.zip` |

- **Environment variables:** `WBGridFormatter` and `WBRagChoice` have none, so their imports need no settings file. If a control adds one, its values differ per client and environment, so they belong in the deploying project's pipeline or repo, not here ([ADR-0005](docs/adr/0005-prefix-agnostic-controls.md)). That project generates a settings file with `pac solution create-settings` and passes it to `pac solution import --settings-file`. Never edit configuration directly in UAT or prod.
- **Using a control:** adding a control to a form field, view or subgrid is a customisation of that *table*, so it belongs to the project solution that owns the table, not to the control's solution. Document the exact steps in the control's README.
- **Order:** import the control's solution before any project solution that references it. Plug-ins are the reverse: import the project solution that owns the table, then the plug-in's solution.
- **Deployment is manual for now.** CI builds and tests; it doesn't deploy. Pipeline automation can be added later (see [CI](#ci)).

## CI

`.github/workflows/ci.yml` runs on every PR and every push to `main`:

1. Checks the conventions (`scripts/check-controls.mjs`: publisher, version alignment, no hard-coded `wb_` in control source, no logical names in plug-in C#) and runs the scripts' own tests (`npm run test:scripts`).
2. Runs `npm ci`, lint and test across all workspaces, then `npm run validate:config` (each control's config files against its JSON Schema).
3. Builds the solution for each **changed** control, and uploads the zips as workflow artifacts. Changes to `packages/`, root tooling or workflows rebuild every control.
4. Builds and tests each **changed** plug-in (`plugins/<Name>/<Name>/<Name>.csproj` and `tests/`), and builds its solution once the registration is in `solution/src/PluginAssemblies`. Changes to root tooling or workflows rebuild every plug-in.

## Moving to William-Buck-Australia

When the repo moves to the enterprise org:

- Transfer the repo (or push to a new repo and archive this one). Issues, labels and releases come across with a transfer.
- Allow GitHub Actions (with GitHub-hosted Ubuntu runners) for the repo. If the org only allows approved actions, approve `actions/checkout`, `actions/setup-node`, `actions/setup-dotnet`, `actions/upload-artifact` and `actions/download-artifact`.
- Add branch protection on `main`: require PRs, a passing CI, and review. Add a `CODEOWNERS` file naming the Power Platform team.
- Update clone URLs in local checkouts with `git remote set-url origin https://github.com/William-Buck-Australia/<repo>.git`.

## Keeping a copy up to date

A project that works in its own copy of this repo (a fork, or a new repo made from it) can merge in later changes with `tools/Sync-FromUpstream.ps1` (PowerShell 7, Windows or macOS). Run it from a clone of the copy:

```powershell
./tools/Sync-FromUpstream.ps1 -UpstreamUrl https://github.com/<org>/PCF-Controls.git   # first time
./tools/Sync-FromUpstream.ps1                                                           # later: reuses the 'upstream' remote
```

It makes a backup branch, merges `upstream/main` into `main`, runs the same checks as CI (`npm ci`, `check:controls`, `test:scripts`, `lint`, `test`, `validate:config`), and pushes only if they pass (it asks first). On a conflict it stops and lists the files; resolve `package.json` first and regenerate `package-lock.json` with `npm install` rather than editing it. A copy made with "Use this template" or by uploading files shares no history with this repo, so its first sync needs `-AllowUnrelatedHistories` and will have many conflicts. After this repo moves org, point the copy at the new URL with `git remote set-url upstream <url>`.

## References

- PCF overview: https://learn.microsoft.com/power-apps/developer/component-framework/overview
- React controls and platform libraries: https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries
- Modern theming: https://learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming
- Grid customizer: https://learn.microsoft.com/power-apps/developer/component-framework/customize-editable-grid-control
- `pac pcf`: https://learn.microsoft.com/power-platform/developer/cli/reference/pcf
- `pac solution`: https://learn.microsoft.com/power-platform/developer/cli/reference/solution
- Microsoft PCF samples: https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework
