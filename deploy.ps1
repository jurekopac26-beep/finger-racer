param (
    [string]$Message = "auto deploy"
)

$ErrorActionPreference = "Stop"
$stage = Join-Path $env:TEMP ("finger_racer_deploy_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
    Copy-Item -Path "index.html" -Destination $stage
    Copy-Item -Path "paho-mqtt.js" -Destination $stage
    Copy-Item -Path "favicon.svg" -Destination $stage
    Copy-Item -Path "favicon-32x32.png" -Destination $stage
    Copy-Item -Path "favicon.ico" -Destination $stage
    Copy-Item -Path "apple-touch-icon.png" -Destination $stage
    Copy-Item -Path "icon-192.png" -Destination $stage
    Copy-Item -Path "icon-512.png" -Destination $stage
    Copy-Item -Path "manifest.json" -Destination $stage
    Write-Host "Files staged to $stage"
    npx netlify deploy --prod --dir=$stage --site=b6f15175-025f-4d35-b8de-fc1a3dd20956 --message $Message
}
finally {
    if (Test-Path $stage) {
        Remove-Item -Recurse -Force $stage
    }
}
