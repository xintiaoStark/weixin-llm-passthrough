@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║         微信 LLM 透传 - 启动脚本                ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: Check node
node --version >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

:: Check npm
npm --version >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm
  pause
  exit /b 1
)

echo [1/3] 正在安装配置服务依赖...
cd /d "%~dp0config-ui"
:: server.js uses only built-in Node modules (http, fs, path) — no npm install needed
echo      完成（使用 Node 内置模块，无需安装）

echo.
echo [2/3] 正在启动配置页面服务...
start "微信LLM配置" cmd /k "node server.js"
timeout /t 2 /nobreak >nul

echo.
echo [3/3] 打开配置页面...
start http://localhost:3456

echo.
echo ══════════════════════════════════════════════════
echo  ✅ 配置页面已在后台启动
echo     地址：http://localhost:3456
echo.
echo  接下来，请在另一个窗口执行以下步骤接入微信：
echo.
echo  步骤 1：安装 OpenClaw（全局）
echo    npm install -g openclaw
echo.
echo  步骤 2：安装本透传插件
echo    openclaw plugins install "%~dp0weixin-passthrough"
echo.
echo  步骤 3：扫码登录微信
echo    npx -y @tencent-weixin/openclaw-weixin-cli@latest install
echo.
echo  步骤 4：启动网关
echo    openclaw gateway
echo.
echo  提示：先在配置页面填好 API Key，再执行步骤 4。
echo ══════════════════════════════════════════════════
echo.
pause
