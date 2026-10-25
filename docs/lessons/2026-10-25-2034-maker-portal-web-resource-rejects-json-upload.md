---
id: 2026-10-25-2034-maker-portal-web-resource-rejects-json-upload
title: The maker portal's web resource file picker doesn't offer .json files
applies_when: >
  a maker creates or updates a JSON config web resource (such as a GridFormatter rules
  file) in make.powerapps.com with New, More, Web resource
rule: >
  When a JSON file has to become a web resource through the maker portal, tell makers to
  paste its contents into the panel's Code box with file type JavaScript (JS), because the
  Choose file picker only accepts the extensions of Dataverse's web resource types.
lesson_type: pitfall
phase: deployment
domain: [dataverse-metadata, grid-customizer]
tech: [dataverse]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-25
  source: direct-experience
  evidence: "controls/GridFormatter/docs/decisions.md V10; issue #35 results comment; PR #37 (configuration guide, Deploy it)"
  author:
related: []
proposed_tags: []
---

When a maker turns a `.json` file into a web resource in make.powerapps.com, the **Choose file** button won't let them pick it.

## What happened
GridFormatter's configuration guide said "upload your `.json` file", but that had only ever been done by script. In `LowCode`, the New web resource panel's file input had `accept=".html,.htm,.css,.jscript,.xml,.js,.xsl,.xslt,.resx,.png,.jpg,.jpeg,.gif,.ico,.svg"`. Pasting the JSON into the **Code** box with file type **JavaScript (JS)** saved it as `webresourcetype` 3, and the name `wb_GridFormatter.spike_probe.json` (with `_` after the prefix) was accepted.

## Why it happened
Dataverse has no JSON web resource type, and the picker filters by the types' extensions. The name's extension isn't checked against the type, so a `.json` name with type JavaScript is fine.

## What to do instead
- Document the paste route: **Code** box, file type JavaScript (JS), name ending `.json`.
- To update rules later, open the web resource and replace its code.
- Scripted deployments (`scripts/test-env/upload-web-resource.mjs`, the Web API) don't have the problem.
- Don't rename config files to `.js` to get past the picker: JSON isn't a valid JavaScript program, so editors and linters would treat it as broken code (ADR-0005).

## How to recognise it early
A deployment step that says "upload" for a file type Dataverse doesn't have.

## When this does NOT apply
Files with a real web resource type (`.js`, `.html`, `.css`, `.xml`, images) upload normally.
