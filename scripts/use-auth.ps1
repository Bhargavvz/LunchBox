# Points the parent app, the partner app and the admin at either the local Firebase Auth emulator or the real
# Firebase project (lunchboxappv1). Edits only git-ignored files: apps/*/.env and apps/admin/.env.local.
#
#   ./scripts/use-auth.ps1 -Target firebase    # real phone OTP (SMS, or the test numbers set in the Firebase console)
#   ./scripts/use-auth.ps1 -Target emulator    # local, codes from `docker compose logs firebase`
#
# Then start the backend with the same target: ./scripts/dev-backend.ps1 -Auth <target>
# The native apps read google-services.json at build time, so rebuild them once after switching
# (npx expo prebuild --platform android, then the Gradle install in docs/runbooks/android-emulator.md).
param(
  [Parameter(Mandatory = $true)][ValidateSet('emulator', 'firebase')][string]$Target
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Set-EnvLine([string]$file, [string]$key, [string]$value) {
  $lines = if (Test-Path $file) { Get-Content $file } else { @() }
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^$([regex]::Escape($key))=") { $found = $true; "$key=$value" } else { $line }
  }
  if (-not $found) { $out += "$key=$value" }
  Set-Content -Path $file -Value $out -Encoding utf8
}

$real = $Target -eq 'firebase'
foreach ($app in 'parent', 'partner') {
  $envFile = Join-Path $root "apps/$app/.env"
  if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root "apps/$app/.env.example") $envFile }
  if ($real -and -not (Test-Path (Join-Path $root "apps/$app/google-services.json"))) {
    throw "apps/$app/google-services.json is missing. Download it from the Firebase console (Project settings > Your apps)."
  }
  Set-EnvLine $envFile 'GOOGLE_SERVICES_JSON' $(if ($real) { './google-services.json' } else { './google-services.local.json' })
  Set-EnvLine $envFile 'EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR' $(if ($real) { '' } else { '10.0.2.2:9099' })
}

$adminEnv = Join-Path $root 'apps/admin/.env.local'
if (-not (Test-Path $adminEnv)) { Copy-Item (Join-Path $root 'apps/admin/.env.example') $adminEnv }
if ($real) {
  $prod = Join-Path $root 'apps/admin/.env.production.local'
  if (-not (Test-Path $prod)) { throw 'apps/admin/.env.production.local (the Firebase web app config) is missing.' }
  foreach ($line in Get-Content $prod) {
    if ($line -match '^(NEXT_PUBLIC_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID))=(.*)$') { Set-EnvLine $adminEnv $Matches[1] $Matches[3] }
  }
  Set-EnvLine $adminEnv 'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR' ''
} else {
  Set-EnvLine $adminEnv 'NEXT_PUBLIC_FIREBASE_API_KEY' ''
  Set-EnvLine $adminEnv 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN' ''
  Set-EnvLine $adminEnv 'NEXT_PUBLIC_FIREBASE_PROJECT_ID' 'demo-lunchbox'
  Set-EnvLine $adminEnv 'NEXT_PUBLIC_FIREBASE_APP_ID' ''
  Set-EnvLine $adminEnv 'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR' 'localhost:9099'
}
Write-Host "Apps and admin now use: $Target. Restart Metro / the admin dev server, and rebuild the native apps once."
