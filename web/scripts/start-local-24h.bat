@echo off
setlocal
title PNP Lead Finder - Modo Local 24h

cd /d "%~dp0.."
if errorlevel 1 (
  echo ERRO: nao foi possivel acessar a pasta web.
  pause
  exit /b 1
)

set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

where powershell >nul 2>&1
if errorlevel 1 (
  echo ERRO: PowerShell nao encontrado.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-24h.ps1"
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Falha ao iniciar. Verifique web\.logs\
  pause
  exit /b %EXIT_CODE%
)

endlocal