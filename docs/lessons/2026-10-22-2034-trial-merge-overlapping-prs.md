---
id: 2026-10-22-2034-trial-merge-overlapping-prs
title: Trial-merge PRs that touch the same docs or lockfile before merging them
applies_when: >
  two or more open PRs in this repo edit the same file, typically a docs guide with numbered sections or package-lock.json
rule: >
  When open PRs overlap, run `git merge-tree --write-tree origin/main origin/<branch>` for the second PR after merging the first, and check the merged file's section numbering, cross-references and workspace versions, because a clean textual merge can still leave duplicate section numbers or mismatched versions.
lesson_type: convention
phase: deployment
domain: [agent-workflow, ci]
scope: this-project
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "PR #31 and PR #32 (merge order); docs/journal/2026-10-22.md Session 20:14"
  author:
related: []
proposed_tags: []
---

When two open PRs in this repo edit the same file, such as the test-environment guide's numbered sections or `package-lock.json`, merging one and then the other can produce a result that merges cleanly but reads wrong.

## What happened
PR #31 (GridFormatter 0.2.0) and PR #32 (RagChoice 0.1.2) both changed `docs/testing/gridformatter-test-environment.md` and `package-lock.json`. #32 had added a §4.8 and renumbered "Open it" to §4.9. After #31 merged, a trial merge with `git merge-tree` showed sections 4.7, 4.8 and 4.9 in order and the lockfile at GridFormatter 0.2.0 and RagChoice 0.1.2, so #32 merged with no fix-up.

## Why it works
`git merge-tree --write-tree` builds the merged tree without touching the worktree, so the merged files can be read with `git show <tree>:<path>` before anything is merged. GitHub's "mergeable" only says there's no textual conflict.

## What to do instead
1. Merge the first PR.
2. `git fetch` and `tree=$(git merge-tree --write-tree origin/main origin/<second-branch>)`.
3. Check `git show $tree:<guide> | grep -nE '^#{2,4} '` for numbering, cross-references to renumbered sections, and the `controls/*` versions in `package-lock.json`.
4. Merge, or fix on the branch first.

## When this does NOT apply
PRs that touch different files, or a lockfile conflict, which is fixed by regenerating the lockfile.
