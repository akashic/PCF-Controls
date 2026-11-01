---
id: 2026-11-01-1103-plugin-tests-pull-vulnerable-pkcs
title: "A net10.0 test project for a plug-in pulls a vulnerable Pkcs through CoreAssemblies"
applies_when: >
  creating a modern .NET MSTest project that references Microsoft.CrmSdk.CoreAssemblies
  to test a net48 Dataverse plug-in
rule: >
  When a plug-in's test project references Microsoft.CrmSdk.CoreAssemblies on modern .NET,
  pin System.Security.Cryptography.Pkcs 6.0.5 in the test project and record it for package
  sign-off, because CoreAssemblies brings System.ServiceModel 4.10.3 and with it Pkcs 6.0.1,
  which has a high-severity advisory (NU1903).
lesson_type: pitfall
phase: implementation
domain: [testing]
tech: []
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-31
  source: direct-experience
  evidence: "PR #63 (commit f2fd1de): NU1903 on GHSA-555c-2p6r-68mm, pin in plugins/WBCodeFYName/tests/WBCodeFYName.Tests.csproj, sign-off recorded as a PR comment"
  author:
related: []
proposed_tags: [plugins, nuget, csharp]
---

When a net10.0 MSTest project references `Microsoft.CrmSdk.CoreAssemblies` to test a net48 plug-in, restore warns `NU1903: Package 'System.Security.Cryptography.Pkcs' 6.0.1 has a known high severity vulnerability` (GHSA-555c-2p6r-68mm).

## What happened
The WBCodeFYName tests (#58) reference CoreAssemblies 9.0.2.60, because the plug-in's own reference is `PrivateAssets`. On .NET 10 that resolves System.ServiceModel 4.10.3, which brings Pkcs 6.0.1. The test project now pins Pkcs 6.0.5, with a comment explaining why, and the user signed off the pin as a new NuGet package before #63 merged.

## Why it happened
CoreAssemblies targets .NET Framework. Restored for modern .NET, it uses the System.ServiceModel compatibility packages, whose dependency chain is older than the advisory fix (6.0.3). The net48 plug-in doesn't get this chain, so the plug-in assembly isn't affected.

## What to do instead
- Add `<PackageReference Include="System.Security.Cryptography.Pkcs" Version="6.0.5" />` to the test project only, with a comment naming the advisory.
- List it in the PR description for sign-off: CLAUDE.md requires approval for any new NuGet package.
- Copy the pin when scaffolding the next plug-in's tests.

## How to recognise it early
`warning NU1903` naming Pkcs during `dotnet test plugins/<Name>/tests`.

## When this does NOT apply
The net48 plug-in project itself. Drop the pin once a CoreAssemblies or System.ServiceModel update resolves Pkcs 6.0.3 or later.
