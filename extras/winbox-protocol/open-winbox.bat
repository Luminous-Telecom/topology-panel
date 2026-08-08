@echo off
REM Encaminha para open-winbox.ps1 (suporta usuario/senha na URI)
setlocal
set "URI=%~1"
if "%URI%"=="" (
  echo Uso: open-winbox.bat winbox://admin:senha@192.168.88.1
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-winbox.ps1" "%URI%"
endlocal
