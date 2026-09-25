@echo off
setlocal
set "PROJECT_DIR=%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
    echo 未找到 pnpm，请安装 pnpm 或将其加入 PATH 后重试。
    pause
    exit /b 1
)

echo 正在启动 Wotty Bookmark...
echo 使用期间请保持此窗口开启。
pnpm --dir "%PROJECT_DIR%" dev

if errorlevel 1 (
    echo.
    echo 项目启动失败，请检查上方错误信息。
    pause
)
endlocal
