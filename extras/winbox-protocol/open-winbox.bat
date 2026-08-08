@echo off
REM Encaminha para o VBS (sem piscar PowerShell)
setlocal
set "URI=%~1"
if "%URI%"=="" (
  echo Uso: open-winbox.bat winboxnovo://192.168.88.1
  exit /b 1
)
wscript.exe //B //Nologo "%~dp0open-winbox.vbs" "%URI%"
endlocal
