---
id: 2026-11-01-1604-pac-solution-init-plugin-template-fixes
title: "pac solution init's template must be fixed before syncing a plug-in solution"
applies_when: >
  creating the solution project for a net48 plug-in with pac solution init (pac 2.14.1), before the
  first pac solution sync and add-reference
rule: >
  When creating a plug-in's solution project with pac solution init, uncomment
  SolutionPackageType Both before the first pac solution sync, change net462 to net48, pin
  Microsoft.PowerApps.MSBuild.Solution and use / in the ProjectReference, because otherwise the build
  fails (NU1201) or produces only one zip.
lesson_type: pitfall
phase: implementation
domain: [plugins, solutions-alm, ci]
tech: [pac-cli]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #66 (commit 24d8783), plugins/WBCodeFYName/solution/WBWBCodeFYName.cdsproj; README 'Adding a plug-in' step 5"
  author:
related: []
proposed_tags: []
---

When `pac solution init` creates the solution project for a net48 plug-in, its template has four defects that only show up later, at build time or in the release output.

## What happened
For WBWBCodeFYName:
- The first `pac solution sync` extracted only the managed variant, because the project said `Managed`. Its `SolutionPackageType Both` group is **commented out** in the template.
- `dotnet build` failed with NU1201, because the template targets net462 and can't reference the net48 plug-in.
- `MSBuild.Solution` floated at `1.*`.
- `add-reference` wrote `..\WBCodeFYName\WBCodeFYName.csproj`.

Even after Both was set, the build made one zip until the comment was removed and the sync was re-run.

## What to do instead
1. Run `pac solution init` in a folder named `WB<Name>`, then rename the folder to `solution`.
2. Before syncing: uncomment `<SolutionPackageType>Both</SolutionPackageType>`, set `TargetFramework` net48 / `TargetFrameworkVersion` v4.8, and pin `Microsoft.PowerApps.MSBuild.Solution` to 1.52.1.
3. Run `pac solution sync`, check that it reports both "Unmanaged Extract" and "Managed Extract", then `add-reference` and change `\` to `/`.

## How to recognise it early
The sync prints only "Managed Extract complete". `bin/Release` has one zip. NU1201 names net462.

## When this does NOT apply
PCF control solutions, whose templates in this repo were already fixed (see `controls/*/solution`).
