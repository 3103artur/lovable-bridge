@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Lovable Bridge v1.6.0 R22 - Idioma, Modelos e Operacoes Tecnicas
set "ROOT=%LOCALAPPDATA%\LovableBridgeNative"
set "NODE=%ROOT%\Tools\Node\node.exe"
echo ============================================================
echo  Lovable Bridge v1.6.0 R22 - Atualizacao cumulativa Windows
echo ============================================================
echo.
echo Esta atualizacao nao instala nem baixa ferramentas.
echo Ela preserva perfis, projetos, logins, chaves e alteracoes pendentes.
echo.
if not exist "%NODE%" goto missing
if not exist "%ROOT%\Config\settings.json" goto missing
for %%F in (apply-r22.js payload\host\host.js payload\extension\sidepanel.js payload\extension\preview-selector.js payload\extension\preview-selector.css) do if not exist "%~dp0%%F" goto package_error
taskkill /IM lovable_bridge_host.exe /T /F >nul 2>&1
"%NODE%" --check "%~dp0payload\host\host.js" || goto failure
"%NODE%" --check "%~dp0payload\extension\sidepanel.js" || goto failure
"%NODE%" --check "%~dp0payload\extension\preview-selector.js" || goto failure
"%NODE%" "%~dp0apply-r22.js" || goto failure
echo.
echo [OK] Atualizacao R22 concluida.
echo Abra chrome://extensions e clique em Recarregar no Lovable Bridge.
echo Feche e abra novamente o painel lateral.
echo Status esperado: Companion 1.6.0 R22 conectado.
echo.
pause
exit /b 0
:missing
echo ERRO: instalacao atual do Lovable Bridge nao localizada.
goto failure_end
:package_error
echo ERRO: pacote incompleto. Extraia o ZIP inteiro antes de executar.
goto failure_end
:failure
echo ERRO: a atualizacao R22 nao foi concluida.
:failure_end
echo Nenhum projeto foi enviado ou apagado.
echo.
pause
exit /b 1
