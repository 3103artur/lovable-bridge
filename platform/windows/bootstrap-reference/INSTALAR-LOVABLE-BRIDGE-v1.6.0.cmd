@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Lovable Bridge v1.6.0 - Instalacao Completa R13

echo ============================================================
echo  Lovable Bridge v1.6.0 - Instalacao Completa R13 para Windows
echo ============================================================
echo.
echo Instala Codex, Antigravity, OpenCode, Ripgrep e o fluxo de publicacao R13.
echo.

for %%F in (LovableBridge-Installer.exe LovableBridge-Ripgrep-Bootstrap.exe LovableBridge-Ripgrep-Fallback.exe register-ripgrep.js apply-r13.js) do (
  if not exist "%~dp0%%F" (
    echo ERRO: %%F nao foi encontrado.
    echo Extraia o ZIP completo antes de executar este arquivo.
    echo.
    pause
    exit /b 1
  )
)

if not exist "%~dp0payload\host\host.js" (
  echo ERRO: payload\host\host.js nao foi encontrado.
  echo Extraia o ZIP completo antes de executar este arquivo.
  echo.
  pause
  exit /b 1
)

"%~dp0LovableBridge-Installer.exe"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" goto installation_error

set "ROOT=%LOCALAPPDATA%\LovableBridgeNative"
set "HOST=%ROOT%\Host"
set "NODE=%ROOT%\Tools\Node\node.exe"
set "RGDIR=%ROOT%\Tools\Ripgrep"
set "RG=%RGDIR%\rg.exe"

echo.
echo ==^> Preparando o Ripgrep oficial...
"%~dp0LovableBridge-Ripgrep-Bootstrap.exe"
if errorlevel 1 (
  echo [AVISO] O download do Ripgrep oficial nao terminou. Usando o fallback local verificado.
)

if not exist "%RGDIR%" mkdir "%RGDIR%" >nul 2>&1
if exist "%RG%" (
  "%RG%" --version >nul 2>&1
  if not errorlevel 1 goto rg_ready
  del /F /Q "%RG%" >nul 2>&1
)
copy /Y "%~dp0LovableBridge-Ripgrep-Fallback.exe" "%RG%" >nul
if errorlevel 1 goto ripgrep_error

:rg_ready
"%RG%" --version
if errorlevel 1 goto ripgrep_error

if not exist "%NODE%" goto node_error
"%NODE%" "%~dp0register-ripgrep.js"
if errorlevel 1 goto ripgrep_register_error

rem Reaplica o Companion e a interface R13 depois de todas as etapas.
taskkill /IM lovable_bridge_host.exe /T /F >nul 2>&1
"%NODE%" "%~dp0apply-r13.js"
if errorlevel 1 goto host_error

echo.
echo Instalacao R13 concluida com sucesso.
echo Codex, Antigravity, OpenCode, Ripgrep, Safety Guard, Patch Rebase e o fluxo de publicacao R13 foram preparados.
echo Recarregue a extensao em chrome://extensions antes de testar.
echo.
pause
exit /b 0

:ripgrep_error
echo.
echo ERRO: nao foi possivel preparar o rg.exe oficial nem o fallback local.
goto installation_error

:ripgrep_register_error
echo.
echo ERRO: o rg.exe foi preparado, mas nao foi registrado no settings.json.
goto installation_error

:node_error
echo.
echo ERRO: o Node.js interno nao foi encontrado depois da instalacao.
goto installation_error

:host_error
echo.
echo ERRO: nao foi possivel aplicar o Companion e a interface R13.
goto installation_error

:installation_error
echo.
echo A instalacao terminou com erro. Veja a mensagem acima.
echo O log principal fica em: %%LOCALAPPDATA%%\LovableBridgeNative\Logs\install-v1.6.0.log
echo Nenhum projeto foi enviado ou apagado.
echo.
pause
exit /b 1
