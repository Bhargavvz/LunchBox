# Creates the local test admin in the Firebase Auth emulator (docker-compose, port 9099).
# The emulator keeps no data between restarts, so run this after every `docker compose up`.
# These are throwaway local test credentials; they only work against the emulator.
param(
  [string]$Email = 'admin@lunchbox.test',
  [string]$Password = 'LunchBox-local-123',
  [string]$EmulatorHost = 'localhost:9099',
  [string]$ProjectId = 'demo-lunchbox'
)

$base = "http://$EmulatorHost/identitytoolkit.googleapis.com/v1"
$owner = @{ Authorization = 'Bearer owner' }  # the emulator's admin bypass
$body = @{ email = $Email; password = $Password; returnSecureToken = $true } | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri "$base/accounts:signUp?key=demo-key" -ContentType 'application/json' -Body $body | Out-Null
  Write-Host "Created $Email in the Firebase Auth emulator."
} catch {
  if ($_.ErrorDetails.Message -match 'EMAIL_EXISTS') {
    Write-Host "$Email already exists in the emulator."
  } else {
    throw
  }
}

# The backend links a staff invite only to a verified email, so mark it verified.
$lookup = Invoke-RestMethod -Method Post -Uri "$base/projects/$ProjectId/accounts:lookup" -Headers $owner `
  -ContentType 'application/json' -Body (@{ email = @($Email) } | ConvertTo-Json)
$uid = $lookup.users[0].localId
Invoke-RestMethod -Method Post -Uri "$base/projects/$ProjectId/accounts:update" -Headers $owner `
  -ContentType 'application/json' -Body (@{ localId = $uid; emailVerified = $true } | ConvertTo-Json) | Out-Null
Write-Host "Marked $Email as verified."
Write-Host "Start the backend with BOOTSTRAP_SUPER_ADMIN_EMAIL=$Email on its first run to grant SUPER_ADMIN."
