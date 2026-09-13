@echo off
cd /d "%~dp0.."
rem Safe default: monitor only. To enable queued work deliberately, pass --execute.
node scripts\worker.mjs %*
