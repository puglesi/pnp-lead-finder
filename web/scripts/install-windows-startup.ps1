# Registra o PNP Lead Finder para iniciar com o Windows no login do usuario
$ErrorActionPreference = "Stop"

$TaskName = "PNP Lead Finder - Modo 24h"
$ScriptPath = Join-Path $PSScriptRoot "start-local-24h.ps1"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Script nao encontrado: $ScriptPath"
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Minimized -ExecutionPolicy Bypass -File `"$ScriptPath`""

$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Inicia PNP Lead Finder em modo producao local na porta 3000 ao fazer login no Windows."

Write-Host "Tarefa criada: $TaskName"
Write-Host "O app iniciara apos o proximo login."
Write-Host "Para remover: powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-windows-startup.ps1"
Write-Host "Logs em: $(Join-Path (Split-Path -Parent $PSScriptRoot) '.logs')"