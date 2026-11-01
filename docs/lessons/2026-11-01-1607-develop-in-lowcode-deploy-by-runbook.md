---
id: 2026-11-01-1607-develop-in-lowcode-deploy-by-runbook
title: "Build and test in LowCode; William Buck gets a managed release and a runbook"
applies_when: >
  an issue or brief says to test or verify something "in dev" for a control or plug-in in this repo,
  or a piece of work is finished and needs to reach William Buck's dev, UAT or prod
rule: >
  When work needs a Dataverse environment, do all development and testing in LowCode, and deliver
  William Buck environments a GitHub Release (managed zip) plus a runbook or guide in the component's
  docs, with checks LowCode can't run (a second user, the mobile app) as explicit UAT steps, because
  agents have no access to William Buck's environments.
lesson_type: convention
phase: deployment
domain: [solutions-alm, testing]
tech: [dataverse, pac-cli]
scope: this-project
cost_if_ignored: rework
confidence: established
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "Developer's instruction on 1 Nov 2026; PR #69 (plugins/WBCodeFYName/docs/runbook.md); PR #71 (controls/ChoiceCounts/docs/william-buck-deployment-guide.md); releases WBCodeFYName-v0.1.0 and ChoiceCounts-v0.1.4"
  author:
related: [2026-11-01-1604-plugin-import-needs-activate-plugins]
proposed_tags: []
---

When an issue says "test in dev", or work is ready for William Buck, the dev environment is `LowCode`, and William Buck's environments are reached only through a release and a document.

## What happened
On 1 Nov 2026 the developer said all development happens in `LowCode` (the personal tenant), with a runbook for deploying to William Buck. WBCodeFYName and ChoiceCounts then followed one path:
1. Test setups were built by scripts in `scripts/test-env/`, with dev's own names.
2. Checks were run and recorded in each `docs/decisions.md`.
3. A `<Name>-v<x.y.z>` tag made a release with the managed zip.
4. The deployment document covers prerequisites in the project solution, import flags, post-import checks, troubleshooting, upgrades, rollback and sign-off.

`LowCode` has one user and no mobile device, so the Read-privilege, least-privileged-user and mobile cases became named UAT checks in those documents.

## What to do instead
- Read "dev" in briefs and issues as `LowCode`.
- Don't mark a check passed if it ran only in `LowCode` but needs a William Buck identity. Put it in the runbook's UAT steps and leave the issue open (as #59 is).
- Deploy only managed zips from releases to William Buck.

## When this does NOT apply
If the developer later gives agents access to a William Buck environment, follow their instruction for that environment.
