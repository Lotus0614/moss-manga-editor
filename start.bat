@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo 没找到 Node，请先安装 Node 22 或更高版本 & pause & exit /b 1)
if not exist "config\config.json" (
  echo 首次运行，正在生成默认配置...
  node manga.mjs doctor
)
node manga.mjs serve --open
pause