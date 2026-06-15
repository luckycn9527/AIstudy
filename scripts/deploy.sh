#!/usr/bin/env bash
#
# AI 考试学习平台 - 服务器一键部署脚本 (Ubuntu / Debian)
#
# 用法:
#   bash scripts/deploy.sh
#
# 可选环境变量:
#   PORT=8080 bash scripts/deploy.sh   # 自定义监听端口 (默认 3001)
#
set -euo pipefail

# ─── 配置 ────────────────────────────────────────────────────────────────────
APP_NAME="aistudy"
REQUIRED_NODE_MAJOR=20
PORT="${PORT:-3001}"

# 解析项目根目录 (脚本位于 <root>/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ─── 工具函数 ────────────────────────────────────────────────────────────────
log()  { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

need_sudo() {
  if [ "$(id -u)" -eq 0 ]; then echo ""; else echo "sudo"; fi
}
SUDO="$(need_sudo)"

# ─── 1. 检查 / 安装 Node.js 20 ───────────────────────────────────────────────
install_node() {
  log "正在安装 Node.js ${REQUIRED_NODE_MAJOR} (NodeSource)..."
  curl -fsSL "https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | ${SUDO} -E bash -
  ${SUDO} apt-get install -y nodejs
}

if command -v node >/dev/null 2>&1; then
  CURRENT_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
  if [ "${CURRENT_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]; then
    warn "检测到 Node.js v${CURRENT_MAJOR}，低于要求的 v${REQUIRED_NODE_MAJOR}，将升级。"
    install_node
  else
    log "Node.js 版本符合要求: $(node -v)"
  fi
else
  warn "未检测到 Node.js，开始安装。"
  install_node
fi

log "Node: $(node -v) | npm: $(npm -v)"

# ─── 2. 安装依赖 ─────────────────────────────────────────────────────────────
log "安装项目依赖 (npm install)..."
npm install

# ─── 3. 构建前后端 ───────────────────────────────────────────────────────────
log "构建前后端 (npm run build)..."
npm run build

# ─── 4. 安装 PM2 (进程守护) ──────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  log "安装 PM2 进程管理器..."
  ${SUDO} npm install -g pm2
fi

# ─── 5. 启动 / 重载服务 ──────────────────────────────────────────────────────
log "通过 PM2 启动服务 (端口 ${PORT})..."
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  PORT="${PORT}" pm2 restart "${APP_NAME}" --update-env
else
  cd "${ROOT_DIR}/packages/backend"
  PORT="${PORT}" pm2 start dist/index.js --name "${APP_NAME}" --update-env
  cd "${ROOT_DIR}"
fi

# 保存进程列表并配置开机自启
pm2 save
if pm2 startup 2>/dev/null | grep -q "sudo"; then
  warn "如需开机自启，请复制并执行上方 'pm2 startup' 输出的命令。"
fi

# ─── 完成 ────────────────────────────────────────────────────────────────────
log "部署完成 ✅"
log "访问地址: http://<服务器IP>:${PORT}"
log "首次使用请进入「系统设置」填写 DeepSeek / SiliconFlow API 密钥。"
log "运维: pm2 status | pm2 logs ${APP_NAME} | pm2 restart ${APP_NAME}"
