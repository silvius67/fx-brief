@echo off
rem Genereaza acum rapoartele GBP/USD si EUR/USD si le deschide in browser.
cd /d "%~dp0"
node run.js
if errorlevel 1 pause
