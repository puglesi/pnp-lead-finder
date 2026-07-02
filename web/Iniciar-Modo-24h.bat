@echo off
setlocal
title PNP Lead Finder - Modo 24h

cd /d "%~dp0"
if errorlevel 1 (
  echo ERRO: nao foi possivel acessar a pasta do app.
  pause
  exit /b 1
)

call "%~dp0scripts\start-local-24h.bat"
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" exit /b %EXIT_CODE%
endlocal