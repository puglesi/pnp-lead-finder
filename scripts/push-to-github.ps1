# Envia o projeto para https://github.com/puglesi/pnp-lead-finder
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Remote = "https://github.com/puglesi/pnp-lead-finder.git"

function Get-GitExe {
    $candidates = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$git = Get-GitExe
if (-not $git) {
    Write-Host "Git nao encontrado. Instale: https://git-scm.com/download/win"
    Write-Host "Depois execute este script novamente."
    exit 1
}

Set-Location $Root
Write-Host "Repositorio: $Remote"
Write-Host "Pasta: $Root"

if (-not (Test-Path ".git")) {
    & $git init
}

$status = & $git status --porcelain
if ($status) {
    & $git add .
    & $git commit -m "PNP Lead Finder — deploy Vercel"
} else {
    Write-Host "Nenhuma alteracao para commit."
}

& $git branch -M main

$remotes = & $git remote 2>$null
if ($remotes -contains "origin") {
    & $git remote set-url origin $Remote
} else {
    & $git remote add origin $Remote
}

Write-Host "Enviando para GitHub..."
& $git push -u origin main
Write-Host "Concluido: $Remote"