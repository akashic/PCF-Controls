---
id: 2026-11-01-1605-flowagent-needs-az-on-path
title: "Power Automate tools fail until the terminal app restarts after installing the Azure CLI"
applies_when: >
  using the Power Automate plug-in's FlowAgent tools in Claude Code on Windows soon after installing
  the Azure CLI, or when doctor reports the token check failing with 'az' is not recognized
rule: >
  When FlowAgent tools fail with "'az' is not recognized" although az is installed and signed in,
  fully close and reopen the terminal app (not just Claude Code or a tab) and resume with
  claude --continue, because the tools' server inherits the stale PATH from the process that
  started it.
lesson_type: pitfall
phase: testing
domain: [agent-workflow]
tech: []
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "docs/testing/wbcodefyname-test-environment.md §4 'Gotchas' (commit 0322bd7, PR #69)"
  author:
related: []
proposed_tags: [power-automate]
---

When the Azure CLI was installed with `winget` during a Claude Code session on Windows, the Power Automate FlowAgent tools kept failing to get a token, even after Claude Code was restarted.

## What happened
`doctor` reported: Azure CLI installed (pass), signed in as the developer (pass), token (**fail**, "'az' is not recognized as an internal or external command"). The machine PATH contained `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin`, but the session's PATH didn't. Restarting Claude Code from the same PowerShell window didn't help. Closing PowerShell completely and starting again did.

## Why it happened
Installers update the machine PATH. Processes already running, and their children (the PowerShell window, Claude Code, the MCP server), keep the PATH they started with.

## What to do instead
- After installing `az`, close the terminal app or VS Code completely, reopen it, `cd` to the repo and run `claude --continue`.
- Until then, call `az` by its full path in Bash (`"/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin/az"`). That works for scripts, but not for the FlowAgent tools.
- Check with the FlowAgent `doctor` tool. Its **token** check is the one that matters.

## When this does NOT apply
macOS or Linux shells that re-read the profile, or a machine where `az` was installed before the terminal started.
