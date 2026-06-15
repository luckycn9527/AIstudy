#!/usr/bin/env bash
#
# AI 考试学习平台 - 服务器一键部署脚本 (Ubuntu / Debian)
#
# 用法:
#   bash scripts/deploy.sh
#
# 可选环境变量:
#   PORT=8080 bash scripts/deploy.sh   # 自定义起始端口 (默认 3001)
#
# 端口说明: 仅使用一个端口 (默认 3001)，后端同时托管前端静态资源。
#           首次启动时若该端口被占用，会自动向后探测并改用下一个空闲端口。
#           (5173 是开发模式 Vite 端口，部署不使用)
#
set -euo pipefail

# ─── 配置 ────────────────────────────────────────────────────────────────────
APP_NAME="aistudy"
REQUIRED_NODE_MAJOR=20
PORT="${PORT:-3001}"
MAX_PORT_PROBE=20   # 端口被占用时，最多向后探测的端口数量

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

# 判断端口是否被占用 (优先用 ss，回退到 netstat / Node)
port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${p} )" 2>/dev/null | grep -q ":${p}"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | grep -q ":${p} "
  else
    # 最后用 Node 探测 (此时 Node 已安装)
    ! node -e "const n=require('net').createServer();n.once('error',()=>process.exit(1));n.once('listening',()=>n.close(()=>process.exit(0)));n.listen(${p},'0.0.0.0')" 2>/dev/null
  fi
}

# 从起始端口向后探测，返回第一个空闲端口
find_free_port() {
  local start="$1" p="$1" limit=$((start + MAX_PORT_PROBE))
  while [ "${p}" -lt "${limit}" ]; do
    if ! port_in_use "${p}"; then echo "${p}"; return 0; fi
    p=$((p + 1))
  done
  return 1
}

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
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  # 已在运行：沿用原有端口重启（端口被本应用占用，无需更换）
  log "检测到已有 ${APP_NAME} 进程，重启中..."
  pm2 restart "${APP_NAME}" --update-env
else
  # 首次启动：若目标端口被占用，自动向后探测空闲端口
  if port_in_use "${PORT}"; then
    warn "端口 ${PORT} 已被占用，自动探测空闲端口..."
    if NEW_PORT="$(find_free_port "${PORT}")"; then
      warn "改用空闲端口 ${NEW_PORT}（原 ${PORT} 被占用）"
      PORT="${NEW_PORT}"
    else
      err "在 ${PORT}~$((PORT + MAX_PORT_PROBE - 1)) 范围内未找到空闲端口，请手动指定 PORT。"
      exit 1
    fi
  fi
  log "通过 PM2 启动服务 (端口 ${PORT})..."
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
