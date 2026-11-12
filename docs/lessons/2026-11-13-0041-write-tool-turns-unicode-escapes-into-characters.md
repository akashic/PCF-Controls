---
id: 2026-11-13-0041-write-tool-turns-unicode-escapes-into-characters
title: "Escapes like \\u00A0 can land on disk as the real character, and \\u2028 then breaks a C# string"
applies_when: >
  an agent writes C#, JSON or JavaScript source containing \uXXXX escape sequences in string literals with its file
  Write or Edit tool, for example test data for whitespace or Unicode normalisation
rule: >
  After writing source that uses \uXXXX escapes, check the file for non-ASCII characters and convert any back to
  escapes, because they can reach disk as the literal characters, and a literal line separator (U+2028) or similar
  ends a C# string literal with "Newline in constant" while other invisible characters silently change what's tested.
lesson_type: pitfall
phase: implementation
domain: [agent-workflow, plugins, testing]
tech: []
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-13
  source: direct-experience
  evidence: "plugins/TextHash/tests/TextHasherTests.cs and StepConfigTests.cs, 13 Nov 2026"
  author:
related: []
proposed_tags: [csharp, unicode]
---

When TextHash's tests were written with `" "`, `" "`, `" "` and `"—"` in string literals, the files on disk held the actual characters, and the build failed with `CS1010: Newline in constant`.

## What happened
`dotnet test` failed on `TextHasherTests.cs` line 30. `od -c` showed raw multi-byte characters where the escapes should have been. U+2028 (line separator) counts as a line break in C#, so it ended the string. The others compiled, but a non-breaking space looks like a normal space in review, so a test can silently check something different from what it reads as.

## What to do instead
- After writing such a file, list non-ASCII characters: `perl -CSD -ne 'print "$.: $_" if /[^\x00-\x7F]/' <file>`.
- Convert them back to escapes outside comments: `perl -CSD -i -pe 'unless (m{^\s*//}) { s/([^\x00-\x7F])/sprintf("\\u%04X", ord($1))/ge }' <file>`.
- Prefer escapes over literal characters in test data for whitespace and Unicode, so a reviewer can see what's tested.

## How to recognise it early
`CS1010 Newline in constant` on a line that looks fine, or a whitespace test that passes or fails unexpectedly.

## When this does NOT apply
Escapes written as double backslashes for JSON inside a C# string (`"\\u2014"`), which reached disk unchanged.
