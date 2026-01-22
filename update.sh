#!/bin/bash
# ========================================
# 网页随手记 (WebNote) - 一键更新脚本
# ========================================

echo "🔄 正在更新 网页随手记..."

# 检查是否在正确的目录
if [ ! -f "manifest.json" ]; then
    echo "❌ 错误：请在插件目录中运行此脚本"
    echo "   (应该能看到 manifest.json 文件)"
    exit 1
fi

# 检查是否有 git
if ! command -v git &> /dev/null; then
    echo "❌ 错误：未安装 Git"
    echo "   请先安装 Git: https://git-scm.com/downloads"
    exit 1
fi

# 检查是否是 git 仓库
if [ ! -d ".git" ]; then
    echo "❌ 错误：当前目录不是 Git 仓库"
    echo "   请使用 git clone 重新下载："
    echo "   git clone https://github.com/beyondguo/webnote.git"
    exit 1
fi

# 拉取最新代码
echo "📥 正在拉取最新版本..."
git pull origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 更新成功！"
    echo ""
    echo "📌 下一步：请在浏览器中刷新插件"
    echo "   1. 打开 chrome://extensions"
    echo "   2. 找到「网页随手记」"
    echo "   3. 点击刷新按钮 🔄"
    echo ""
else
    echo "❌ 更新失败，请检查网络连接"
fi
