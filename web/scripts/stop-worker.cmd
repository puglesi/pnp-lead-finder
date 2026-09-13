@echo off
cd /d "%~dp0.."
rem Graceful stop request; never taskkill a process or remove a database.
node scripts\stop-worker.mjs
