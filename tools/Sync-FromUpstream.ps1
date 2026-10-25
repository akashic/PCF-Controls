#Requires -Version 7.0
<#
.SYNOPSIS
  Merges updates from the original PCF-Controls repo (upstream) into a copy of it, keeping the copy's own edits.

.DESCRIPTION
  Adds the original repo as a second remote and merges it in:
    1. Makes a timestamped backup branch of the copy's branch.
    2. Adds the original repo as the 'upstream' remote (if it isn't already) and fetches it.
    3. Merges upstream/<branch> into the copy.
    4. Stops on conflicts and lists the files to resolve.
    5. Runs CI's checks on the merged result (npm ci, check:controls, test:scripts, lint, test, validate:config).
       -SkipChecks skips them.
    6. Pushes the result to origin (asks first; -Confirm:$false skips the prompt).

  Run it from a clone of the COPY (the new repo), or pass -RepoPath. It refuses to start with
  uncommitted changes, so a failed merge can always be undone with 'git merge --abort' or the backup branch.

  The original repo's URL isn't built in, because the repo moves between GitHub orgs (README, "Moving to
  William-Buck-Australia"). Pass -UpstreamUrl the first time; later runs reuse the 'upstream' remote.
  Adapted from BGLConnector's tools/Sync-FromUpstream.ps1.

.EXAMPLE
  ./tools/Sync-FromUpstream.ps1 -UpstreamUrl https://github.com/<org>/PCF-Controls.git
.EXAMPLE
  # Later runs: the 'upstream' remote is already set
  ./tools/Sync-FromUpstream.ps1 -RepoPath ~/src/client-pcf-controls
.EXAMPLE
  # First sync into a copy made by uploading files or "Use this template" (no shared history)
  ./tools/Sync-FromUpstream.ps1 -UpstreamUrl https://github.com/<org>/PCF-Controls.git -AllowUnrelatedHistories
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$RepoPath = (Get-Location).Path,
    [string]$UpstreamUrl,
    [string]$Branch = 'main',
    [string]$UpstreamBranch = 'main',
    [switch]$AllowUnrelatedHistories,
    [switch]$SkipChecks
)
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    # Runs git and throws on a non-zero exit code, unless -AllowFailure is set. Pass git's long options
    # (--verbose, --delete): PowerShell would take short ones like -v or -d as its own -Verbose or -Debug.
    param([Parameter(ValueFromRemainingArguments)][string[]]$GitArgs, [switch]$AllowFailure)
    # git writes progress to stderr; stringify it so PowerShell doesn't show it as an error.
    $output = & git -C $RepoPath @GitArgs 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
        throw "git $($GitArgs -join ' ') failed (exit $LASTEXITCODE):`n$($output -join "`n")"
    }
    $output
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is not installed or not on PATH.' }
if (-not $SkipChecks -and -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is not installed or not on PATH. Install Node (see .nvmrc), or pass -SkipChecks and run the checks yourself.'
}
Invoke-Git rev-parse --is-inside-work-tree | Out-Null
if (Invoke-Git status --porcelain) {
    throw 'The repo has uncommitted changes. Commit or stash them first, so the merge can be undone cleanly.'
}

# The upstream URL: -UpstreamUrl, or the existing 'upstream' remote. Checked before the backup branch is made.
$existing = Invoke-Git remote get-url upstream -AllowFailure
$hasUpstream = $LASTEXITCODE -eq 0
if (-not $UpstreamUrl) {
    if (-not $hasUpstream) {
        throw "No 'upstream' remote yet. Pass the original repo's URL: -UpstreamUrl https://github.com/<org>/PCF-Controls.git"
    }
    $UpstreamUrl = "$existing".Trim()
}
elseif ($hasUpstream -and "$existing".Trim() -ne $UpstreamUrl) {
    throw "Remote 'upstream' already points to $existing, not $UpstreamUrl. Fix it with 'git remote set-url upstream <url>' (for example after the original repo moved org)."
}

# 1. Safety branch
Write-Host "== Updating '$Branch' from origin ==" -ForegroundColor Cyan
Invoke-Git checkout $Branch | Out-Null
Invoke-Git pull origin $Branch | Out-Host
$backup = "backup-before-upstream-merge-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Invoke-Git branch $backup | Out-Null
Write-Host "Backup branch: $backup"

# 2. Upstream remote
if (-not $hasUpstream) {
    Invoke-Git remote add upstream $UpstreamUrl | Out-Null
    Write-Host "Added remote 'upstream' -> $UpstreamUrl"
}
Write-Host "== Fetching upstream ==" -ForegroundColor Cyan
Invoke-Git fetch upstream | Out-Host
Invoke-Git remote --verbose | Out-Host

# 3. Merge. Without a common ancestor git refuses the merge, so check first and explain.
$target = "upstream/$UpstreamBranch"
Invoke-Git merge-base HEAD $target -AllowFailure | Out-Null
$related = $LASTEXITCODE -eq 0
if (-not $related -and -not $AllowUnrelatedHistories) {
    throw "The copy and $target share no history (the copy wasn't made as a fork). Re-run with -AllowUnrelatedHistories, and expect many conflicts on the first sync."
}
$mergeArgs = @('merge', $target, '--no-edit')
if (-not $related) { $mergeArgs += '--allow-unrelated-histories' }

$headBefore = "$(Invoke-Git rev-parse HEAD)".Trim()
Write-Host "== Merging $target into $Branch ==" -ForegroundColor Cyan
Invoke-Git @mergeArgs -AllowFailure | Out-Host

# 4. Conflicts: stop here and leave the merge in progress for the user to resolve.
$conflicts = Invoke-Git diff --name-only --diff-filter=U
if ($conflicts) {
    Write-Host "`nMerge conflicts in:" -ForegroundColor Yellow
    $conflicts | ForEach-Object { Write-Host "  $_" }
    Write-Host @"

For each file, edit the <<<<<<< / ======= / >>>>>>> blocks to what you want to keep and delete the
marker lines (VS Code's Accept Current / Incoming / Both buttons help).
Don't hand-merge package-lock.json: resolve the package.json files first, then take either side of
the lockfile ('git -C "$RepoPath" checkout --theirs package-lock.json') and run 'npm install' to
regenerate it. Then check and finish:

  git -C "$RepoPath" add <file>
  npm ci; npm run check:controls; npm run lint; npm test
  git -C "$RepoPath" commit --no-edit
  git -C "$RepoPath" push origin $Branch

To back out instead:   git -C "$RepoPath" merge --abort
To restore the backup: git -C "$RepoPath" reset --hard $backup
"@
    exit 1
}
if ($LASTEXITCODE -ne 0) { throw "Merge failed. To back out: git -C `"$RepoPath`" merge --abort" }

if ("$(Invoke-Git rev-parse HEAD)".Trim() -eq $headBefore) {
    Write-Host "`nAlready up to date with $target. Nothing to push." -ForegroundColor Green
    Invoke-Git branch --delete $backup | Out-Null
    exit 0
}

# 5. Checks: upstream changes often touch package.json and the lockfile, so prove the merge builds
# before pushing it. The merge commit stays local if a check fails.
if (-not $SkipChecks) {
    Push-Location $RepoPath
    try {
        # The same checks, in the same order, as .github/workflows/ci.yml's checks job.
        foreach ($check in @('ci', 'run check:controls', 'run test:scripts', 'run lint', 'test', 'run validate:config')) {
            Write-Host "== npm $check ==" -ForegroundColor Cyan
            & npm @($check -split ' ') | Out-Host
            if ($LASTEXITCODE -ne 0) {
                Write-Host @"

'npm $check' failed after the merge, so nothing was pushed. Fix it and commit, then push:
  git -C "$RepoPath" push origin $Branch
To undo the merge: git -C "$RepoPath" reset --hard $backup
"@ -ForegroundColor Yellow
                exit 1
            }
        }
    }
    finally { Pop-Location }
}

# 6. Push
if ($PSCmdlet.ShouldProcess("origin/$Branch", 'Push merged upstream changes')) {
    Invoke-Git push origin $Branch | Out-Host
    Write-Host "`nPushed. The backup branch '$backup' is local only; delete it with 'git branch -D $backup' once you're happy." -ForegroundColor Green
}
else {
    Write-Host "`nMerged locally but not pushed. Push with: git -C `"$RepoPath`" push origin $Branch"
}
