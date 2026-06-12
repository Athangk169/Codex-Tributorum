# Staged build + sync into dist/ (Windows, current laptop-as-server era).
#
# Why: building straight into dist/ fails with EPERM whenever tailscale
# serve is streaming a file from it (vite must empty the folder first).
# Building to a staging dir and syncing over never deletes the live tree.
#
# Usage:  powershell -File deploy\deploy.ps1   (from the repo root)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

npx vite build --outDir dist-next
if ($LASTEXITCODE -ne 0) { throw "build failed" }

# /E recurse, /PURGE drop files no longer in the build (stale hashed
# bundles otherwise accumulate forever and bloat dist/ and the APK),
# /R:1 /W:1 one quick retry, skip files that stay locked (in-flight
# streams of unchanged assets — safe to skip).
robocopy dist-next dist /E /PURGE /R:1 /W:1 /NFL /NDL /NJH | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

Remove-Item -Recurse -Force dist-next
Write-Output "deployed: dist/ updated in place (robocopy exit $LASTEXITCODE; 0-7 = ok)"
