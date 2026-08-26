$project = "C:\Users\Pugliese\Documents\pnp_lead_finder\web"

$running = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if (-not $running) {
    Start-Process "cmd.exe" -ArgumentList "/k", "cd /d `"$project`" && npm.cmd run dev" -WindowStyle Minimized
}

$ready = $false

for ($i = 0; $i -lt 60; $i++) {
    try {
        $response = Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            $ready = $true
            break
        }
    } catch {}

    Start-Sleep -Seconds 1
}

if ($ready) {
    Start-Process "http://localhost:3000"
} else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "O P&P Lead Finder nao conseguiu iniciar na porta 3000.",
        "P&P Lead Finder"
    )
}
