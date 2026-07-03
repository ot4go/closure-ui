@echo off
setlocal
rem Download every asset of a closure-ui release and verify its checksums.
rem Usage: download-release.bat [vX.Y.Z]     (no arg = latest release)
rem Assets land in release\download\<tag>\  (release/ is gitignored).

set TAG=%1
if "%TAG%"=="" for /f "delims=" %%i in ('gh release view --json tagName -q .tagName') do set TAG=%%i
if "%TAG%"=="" (
  echo could not resolve the latest release tag
  exit /b 1
)

set DIR=%~dp0release\%TAG%
gh release download %TAG% -D "%DIR%" --clobber || exit /b 1

echo.
echo verifying checksums:
pwsh -NoProfile -Command "Set-Location '%DIR%'; $bad=0; Get-Content checksums.txt | ForEach-Object { $h,$f = $_ -split '  '; if ((Get-FileHash $f -Algorithm SHA256).Hash.ToLower() -eq $h) { 'OK    ' + $f } else { $bad=1; 'FAIL  ' + $f } }; exit $bad" || exit /b 1

echo.
echo release %TAG% downloaded to %DIR%      


