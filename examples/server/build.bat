@echo off
REM Build the examples demo server into examples\server.exe (next to the html
REM pages and the data\ folder it serves). Run from anywhere.
pushd "%~dp0"
go build -o ..\server.exe .
popd
