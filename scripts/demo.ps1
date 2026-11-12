$ErrorActionPreference = "Stop"

# PowerShell walkthrough of dz-sandbox v0.1.0:
# Starts the sandbox ephemerally, runs the express-checkout duplicate_webhook bug/fix demo,
# creates a Yalidine COD parcel, and advances the virtual clock by 2h.

$RootDir = Split-Path -Parent $PSScriptRoot
Push-Location $RootDir

try {
  if (-not (Test-Path "packages/cli/dist/cli.js")) {
    Write-Host "Building workspace first..."
    npm run build
  }

  $env:DZ_CONTROL_PORT = if ($env:DZ_CONTROL_PORT) { $env:DZ_CONTROL_PORT } else { "4100" }
  $env:DZ_CHARGILY_PORT = if ($env:DZ_CHARGILY_PORT) { $env:DZ_CHARGILY_PORT } else { "4101" }
  $env:DZ_SATIM_PORT = if ($env:DZ_SATIM_PORT) { $env:DZ_SATIM_PORT } else { "4102" }
  $env:DZ_YALIDINE_PORT = if ($env:DZ_YALIDINE_PORT) { $env:DZ_YALIDINE_PORT } else { "4103" }
  $env:DZ_CONTROL_URL = "http://127.0.0.1:$($env:DZ_CONTROL_PORT)"
  $env:CHARGILY_BASE_URL = "http://127.0.0.1:$($env:DZ_CHARGILY_PORT)/api/v2"
  $env:SATIM_BASE_URL = "http://127.0.0.1:$($env:DZ_SATIM_PORT)/payment/rest"
  $env:YALIDINE_BASE_URL = "http://127.0.0.1:$($env:DZ_YALIDINE_PORT)/v1"

  Write-Host "[1/4] Starting dz-sandbox on ports $($env:DZ_CONTROL_PORT)-$($env:DZ_YALIDINE_PORT)..."
  $proc = Start-Process -FilePath "node" -ArgumentList "packages/cli/dist/cli.js", "start" -PassThru -WindowStyle Hidden

  try {
    $healthy = $false
    for ($i = 0; $i -lt 40; $i++) {
      try {
        $resp = Invoke-RestMethod -Uri "$($env:DZ_CONTROL_URL)/__control/health" -TimeoutSec 1
        if ($resp.status -eq "ok") { $healthy = $true; break }
      } catch {
        Start-Sleep -Milliseconds 250
      }
    }
    if (-not $healthy) { throw "Sandbox failed to become healthy." }

    Write-Host "[2/4] Running Chargily duplicate_webhook bug-vs-fix + SATIM card walkthrough..."
    npm run demo -w dz-sandbox-express-checkout-example

    Write-Host "[3/4] Creating Yalidine COD parcel with lifecycle_fast..."
    Invoke-RestMethod -Method Put -Uri "$($env:DZ_CONTROL_URL)/__control/scenario/yalidine" `
      -ContentType "application/json" -Body '{"scenario":"lifecycle_fast"}' | Out-Null

    $headers = @{ "X-API-ID" = "demo_id"; "X-API-TOKEN" = "demo_token" }
    $parcelBody = '[{"order_id":"ORD-DEMO-1","firstname":"Amine","familyname":"Kaci","contact_phone":"0550123456","address":"Didouche Mourad","to_commune_name":"Alger Centre","to_wilaya_id":16,"product_list":"Book","price":2500,"freeshipping":true,"is_stopdesk":false}]'
    $created = Invoke-RestMethod -Method Post -Uri "$($env:YALIDINE_BASE_URL)/parcels" `
      -Headers $headers -ContentType "application/json" -Body $parcelBody
    Write-Host "Created parcel:" ($created | ConvertTo-Json -Compress)

    Write-Host "[4/4] Advancing virtual clock by 2 hours instantaneously..."
    $clock = Invoke-RestMethod -Method Post -Uri "$($env:DZ_CONTROL_URL)/__control/clock/advance" `
      -ContentType "application/json" -Body '{"duration":"2h"}'
    Write-Host "Virtual clock:" ($clock | ConvertTo-Json -Compress)

    $parcels = Invoke-RestMethod -Method Get -Uri "$($env:YALIDINE_BASE_URL)/parcels" -Headers $headers
    Write-Host "Parcels after 2h:" ($parcels | ConvertTo-Json -Depth 4 -Compress)
    Write-Host "Demo complete!"
  } finally {
    if ($proc -and -not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force
    }
    if (Test-Path ".dz-sandbox.pid") {
      Remove-Item ".dz-sandbox.pid" -Force -ErrorAction SilentlyContinue
    }
  }
} finally {
  Pop-Location
}
