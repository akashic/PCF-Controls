---
id: 2026-11-01-1101-signed-plugin-cannot-use-internalsvisibleto
title: "A strong-named plug-in can't expose internals to its unsigned test project"
applies_when: >
  writing unit tests for a Dataverse plug-in assembly in this repo and reaching for
  InternalsVisibleTo so the tests can call internal helper classes
rule: >
  When a plug-in's helpers need unit tests, make the helper classes public instead of
  adding InternalsVisibleTo, because plug-in assemblies are strong-name signed and the
  build rejects a friend declaration that names an unsigned test assembly without a public key.
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
  evidence: "PR #63 (commit f2fd1de): plugins/WBCodeFYName/WBCodeFYName.csproj has SignAssembly true and no InternalsVisibleTo; NameRules and StepConfig are public"
  author:
related: []
proposed_tags: [plugins, csharp, mstest]
---

When a Dataverse plug-in's tests need to call its internal helper classes, `InternalsVisibleTo` fails the build, because plug-in assemblies must be strong-name signed and the MSTest project isn't.

## What happened
The first draft of WBCodeFYName (#58) kept `NameRules` and `StepConfig` internal and added `<InternalsVisibleTo Include="WBCodeFYName.Tests" />` to the csproj. The signed assembly wouldn't build with it, so the item was removed and the helpers were made `public`.

## Why it happened
Dataverse only accepts strong-named plug-in assemblies, so `SignAssembly` is on (ADR-0006, enforced by `check:controls`). A strong-named assembly can only name friend assemblies by their full public key, and the net10.0 test project is unsigned, so it has no key to name.

## What to do instead
- Make the testable helpers `public` (`public static class NameRules`, `public sealed class StepConfig`). Nothing outside the plug-in loads this assembly, so the wider visibility exposes nothing.
- Leave the test project unsigned. Signing it only to satisfy `InternalsVisibleTo` means another key to manage.

## How to recognise it early
A plug-in csproj with both `<SignAssembly>true</SignAssembly>` and `<InternalsVisibleTo>`.

## When this does NOT apply
Unsigned assemblies, such as the test project itself or a plug-in package's dependent assemblies, if a future plug-in uses the NuGet plug-in package model.
