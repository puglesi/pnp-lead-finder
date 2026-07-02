# PNP Lead Finder - inicia servidor em modo producao local (24h)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$LogDir = Join-Path $Root ".logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("local-24h-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

if (-not $env:NEXT_PUBLIC_APP_URL) {
    $env:NEXT_PUBLIC_APP_URL = "http://localhost:3000"
}

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Add-NodeToPath {
    $nodeDirs = @(
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs",
        "$env:APPDATA\npm"
    )

    foreach ($dir in $nodeDirs) {
        if ($dir -and (Test-Path $dir) -and ($env:Path -notlike "*$dir*")) {
            $env:Path = "$dir;$env:Path"
        }
    }
}

function Get-NpmCommand {
    Add-NodeToPath

    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd) { return $npmCmd.Source }

    foreach ($dir in @(
            "C:\Program Files\nodejs",
            "C:\Program Files (x86)\nodejs",
            "$env:LOCALAPPDATA\Programs\nodejs"
        )) {
        $candidate = Join-Path $dir "npm.cmd"
        if (Test-Path $candidate) { return $candidate }
    }

    return $null
}

function Test-PortOpen {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $Port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Stop-ListenerOnPort {
    param([int]$Port)

    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) { return $true }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        Write-Log "Encerrando $($proc.ProcessName) PID $procId na porta $Port"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Seconds 1
        if (-not (Test-PortOpen -Port $Port)) { return $true }
    }

    return $false
}

function Ensure-PortAvailable {
    param([int]$Port)

    if (-not (Test-PortOpen -Port $Port)) { return }

    Write-Log "Porta $Port ocupada, liberando para o Modo Local 24h..."
    if (-not (Stop-ListenerOnPort -Port $Port)) {
        throw "Nao foi possivel liberar a porta $Port. Feche o outro programa manualmente."
    }
    Write-Log "Porta $Port liberada"
}

function Invoke-NpmLogged {
    param(
        [string[]]$NpmArgs,
        [switch]$IgnoreExitCode
    )

    $npmPath = Get-NpmCommand
    if (-not $npmPath) {
        throw "npm nao encontrado. Instale Node.js 20+ e reinicie o PC."
    }

    & $npmPath @NpmArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            Write-Log $_.ToString()
        } else {
            Write-Log "$_"
        }
    }

    $exitCode = $LASTEXITCODE
    if ($IgnoreExitCode) { return }

    if ($null -ne $exitCode -and $exitCode -ne 0) {
        throw "Comando npm falhou com codigo $exitCode"
    }
}

Write-Log "PNP Lead Finder - Modo Local 24h"
Write-Log "Pasta: $Root"
Write-Log "Log: $LogFile"

try {
    if (-not (Test-Path (Join-Path $Root "node_modules"))) {
        Write-Log "Instalando dependencias..."
        Invoke-NpmLogged -NpmArgs @("install")
    } else {
        Write-Log "Dependencias ja instaladas, pulando npm install"
    }

    Write-Log "Build de producao..."
    Invoke-NpmLogged -NpmArgs @("run", "build")

    Ensure-PortAvailable -Port 3000

    Write-Log "Servidor em http://localhost:3000 - Ctrl+C para parar"
    Write-Log "Ative Modo Local 24h no dashboard apos abrir o navegador"

    Invoke-NpmLogged -NpmArgs @("run", "start") -IgnoreExitCode
    Write-Log "Servidor encerrado."
    exit 0
}
catch {
    Write-Log $_.Exception.Message
    exit 1
}