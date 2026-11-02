---
id: 2026-11-02-2259-sandbox-host-not-available-is-transient
title: "\"No Sandbox Hosts are currently available\" is the platform, not the plug-in's code"
applies_when: >
  a save on a table with a WBCodeFYName (or any custom) plug-in step fails with "The plug-in
  execution failed because no Sandbox Hosts are currently available"
rule: >
  When a save fails with SandboxHostNotAvailable (-2147204722), wait a few minutes and retry, and
  check the plug-in trace log before touching the code, because Dataverse raises it before the
  assembly runs; a code fault gives SandboxWorkerProcessCrashed or the plug-in's own message.
lesson_type: pitfall
phase: operation
domain: [plugins]
tech: [dataverse]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-02
  source: incident
  evidence: "Microsoft reference #DEF7D9B8: SMSF Matter save in a William Buck environment on 2 Nov 2026, WBCodeFYName 0.1.0; cleared on retry"
  author:
related: [2026-11-01-1605-plugin-trace-log-off-and-delayed]
proposed_tags: []
---

When a save on SMSF Matter fails with `The plug-in execution failed because no Sandbox Hosts are currently available. Please check that you have a Sandbox server configured and that it is running.`, the plug-in's code never ran, and the fault is on Microsoft's side.

## What happened
Soon after WBCodeFYName 0.1.0 was imported into a William Buck environment, a save on SMSF Matter failed with that message, a `SandboxHostCommunicationException` stack trace and reference `#DEF7D9B8`. A few minutes later the same save worked, with no change to the plug-in or the environment.

## Why it happened
Every custom plug-in in Dataverse online runs in a sandbox host that Microsoft manages. This error (`SandboxHostNotAvailable`, `0x8004418e`) means Dataverse couldn't reach any host. The stack trace was all Microsoft's `RemotePlugin.Grpc.SandboxFabricGrpcClient` frames, with no `WBCodeFYName` frames. The root cause on Microsoft's side isn't known.

## What to do instead
1. Retry after a few minutes.
2. If it persists, check the plug-in trace log ([trace log lesson](2026-11-01-1605-plugin-trace-log-off-and-delayed.md)). No WBCodeFYName entry means the code never ran.
3. Save on another table that has a synchronous custom plug-in. If that fails too, it's environment-wide.
4. If it lasts, raise a Microsoft support ticket with the reference number. Also ask the admin whether the environment uses Azure VNet support (subnet delegation), because a changed or full delegated subnet can stop plug-ins running.

## How to recognise it early
The words "no Sandbox Hosts", or `-2147204722`. A plug-in fault looks different: `SandboxWorkerProcessCrashed` (`-2147204723`), or one of the messages in the WBCodeFYName README.

## When this does NOT apply
"Sandbox Worker process crashed", or any of WBCodeFYName's own messages. Those come from code that ran.
