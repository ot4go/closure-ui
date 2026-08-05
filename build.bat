@echo off
rem GOWORK=off: build with the exact versions .build/go.mod pins, like CI —
rem the _p/go.work workspace (local sibling repos) must not leak in here.
set GOWORK=off
go -C .build run ./build
