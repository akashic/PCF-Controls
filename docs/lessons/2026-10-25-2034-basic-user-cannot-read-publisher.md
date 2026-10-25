---
id: 2026-10-25-2034-basic-user-cannot-read-publisher
title: Ordinary users can't read publisher or solution, so controls can't look up prefixes
applies_when: >
  designing a PCF control that queries the publisher or solution table at runtime
  through context.webAPI, for example to find a project's customization prefix
rule: >
  When a control would query publisher or solution as the signed-in user, design without
  it, because the Basic User role has no Publisher or Solution privileges and the request
  fails for ordinary users.
lesson_type: pitfall
phase: design
domain: [pcf-controls, dataverse-metadata]
tech: [dataverse-web-api, pcf]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-25
  source: direct-experience
  evidence: "issue #35 results comment; controls/GridFormatter/docs/decisions.md V10; ADR-0005 (lookup decision revised)"
  author:
related: []
proposed_tags: []
---

When a PCF control reads the `publisher` or `solution` table through `context.webAPI`, it runs as the signed-in user, and an ordinary user can't read either table.

## What happened
ADR-0005 first chose to find GridFormatter's rules by reading every publisher's `customizationprefix` and then querying exact web resource names. The spike in `LowCode` showed the Basic User role (`RetrieveRolePrivilegesRole`) has no Publisher or Solution privileges at all, only `prvReadWebResource` at Global depth among the tables involved. The design had been tested only as a System Administrator, where it works. It was changed to one `endswith` query before any code was written.

## Why it happened
Customization tables like `publisher` are readable by makers and admins, not by the Basic User role every user has.

## What to do instead
- Before designing a runtime lookup on a system table, check the Basic User role's privileges: `GET roles?$filter=name eq 'Basic User' and _parentroleid_value eq null`, then `RetrieveRolePrivilegesRole(RoleId=…)`, and look for `prvRead<Table>`.
- Prefer tables every user can read, such as `webresource`.
- Don't ask projects to grant extra privileges to make a control work; it's easy to forget, and the control then fails quietly.

## How to recognise it early
A control that works for the developer (an admin) but not for a test user with only Basic User.

## When this does NOT apply
Code that runs with elevated rights, such as a plug-in or a deployment script.
