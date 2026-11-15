# Starts the backend locally (local profile, docker compose services) against either the Firebase Auth emulator or
# the real Firebase project.
#
#   ./scripts/dev-backend.ps1                     # emulator (default), database "lunchbox"
#   ./scripts/dev-backend.ps1 -Auth firebase      # real Firebase: real token checks and real push notifications
#
# Real Firebase uses its own local database ("lunchbox_firebase"): accounts made through the emulator are tied to
# emulator user ids, so the two must not share data. The service-account key is read from -FirebaseKey; keep it
# outside the repository (default: %USERPROFILE%\.secrets\lunchbox-firebase-admin.json).
param(
  [ValidateSet('emulator', 'firebase')][string]$Auth = 'emulator',
  [string]$FirebaseKey = (Join-Path $env:USERPROFILE '.secrets\lunchbox-firebase-admin.json'),
  [string]$BootstrapAdminEmail = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Gradle 8 cannot run on Java 25 (Android Studio's bundled runtime); use an installed JDK 21.
# `java -version` prints to stderr, which Windows PowerShell turns into an error under -ErrorAction Stop; go via cmd.
$javaExe = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
$javaVersion = cmd /c "`"$javaExe`" -version 2>&1" | Select-Object -First 1
if ("$javaVersion" -notmatch '"21\.') {
  $jdk = Get-ChildItem 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft' -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^jdk-?21' } | Select-Object -First 1
  if (-not $jdk) { throw 'JDK 21 is required for the backend. Install Temurin 21 and run again.' }
  $env:JAVA_HOME = $jdk.FullName
}

# Lets the Android emulator upload handover photos to LocalStack through the PC.
$env:S3_PRESIGN_ENDPOINT = 'http://10.0.2.2:4566'
if ($BootstrapAdminEmail) { $env:BOOTSTRAP_SUPER_ADMIN_EMAIL = $BootstrapAdminEmail }

if ($Auth -eq 'firebase') {
  if (-not (Test-Path $FirebaseKey)) { throw "Service-account key not found at $FirebaseKey (use -FirebaseKey <path>)." }
  $projectId = (Get-Content $FirebaseKey -Raw | ConvertFrom-Json).project_id
  Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
  $env:GOOGLE_CLOUD_PROJECT = $projectId
  $env:GOOGLE_APPLICATION_CREDENTIALS = (Resolve-Path $FirebaseKey).Path
  $env:FCM_MODE = 'live'
  $env:DB_URL = 'jdbc:postgresql://localhost:5432/lunchbox_firebase'
  Push-Location $root
  try {
    $exists = docker compose exec -T postgres psql -U lunchbox -d lunchbox -tAc "select 1 from pg_database where datname='lunchbox_firebase'"
    if ("$exists".Trim() -ne '1') { docker compose exec -T postgres psql -U lunchbox -d lunchbox -c 'create database lunchbox_firebase' | Out-Null }
  } finally { Pop-Location }
  Write-Host "Backend: real Firebase project '$projectId', push live, database lunchbox_firebase"
} else {
  $env:FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'
  Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS, Env:FCM_MODE, Env:DB_URL -ErrorAction SilentlyContinue
  Write-Host 'Backend: Firebase Auth emulator, database lunchbox'
}

Push-Location (Join-Path $root 'backend')
try { .\gradlew.bat bootRun --console=plain '--args=--spring.profiles.active=local' }
finally { Pop-Location }
