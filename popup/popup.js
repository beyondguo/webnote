document.addEventListener('DOMContentLoaded', async () => {
    // 初始化
    updateStats();

    // 绑定事件
    document.getElementById('viewCurrentPage').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            // 打开侧边栏
            chrome.sidePanel.open({ windowId: tab.windowId });
        }
    });

    document.getElementById('viewAllNotes').addEventListener('click', () => {
        chrome.tabs.create({ url: 'pages/all-notes.html' });
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    });

    // AI Chat button - Opens sidebar with AI tab
    document.getElementById('chatWithAI').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            alert('无法获取当前标签页');
            return;
        }
        // Open sidebar with AI tab
        await chrome.sidePanel.open({ windowId: tab.windowId });
        // Send message to switch to AI tab
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'switch-to-ai-tab' });
        }, 300);
    });

    document.getElementById('extractPageContent').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            alert('无法获取当前标签页');
            return;
        }

        try {
            // Send message to content script to extract markdown
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractMarkdown' });

            if (response && response.success) {
                // Save the markdown
                await chrome.runtime.sendMessage({
                    action: 'save-page-markdown',
                    url: tab.url,
                    markdown: response.markdown,
                    metadata: response.metadata
                });

                alert('✅ 页面内容提取成功！\n\n可以在"全部笔记"页面查看。');
            } else {
                alert('❌ 提取失败：' + (response?.error || '未知错误'));
            }
        } catch (error) {
            console.error('Extract failed:', error);
            alert('❌ 提取失败：' + error.message);
        }
    });

    // Check FS Status
    const hasAccess = await storageManager.ensureFolderAccess(false);
    const setupBtn = document.getElementById('setupFolder');
    if (!hasAccess) {
        setupBtn.style.backgroundColor = '#fff3cd';
        setupBtn.style.color = '#856404';
        setupBtn.style.border = '1px solid #ffeeba';
        setupBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>⚠️ 未同步 (点击修复)</span>
        `;
    }

    document.getElementById('setupFolder').addEventListener('click', async () => {
        // Navigate to full page for easier authorization
        chrome.tabs.create({ url: 'pages/all-notes.html' });
    });

    document.getElementById('themeToggle').addEventListener('click', () => {
        // 简单的主题切换逻辑，需要配合 styles.css
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
});

async function updateStats() {
    try {
        // 获取当前标签
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 获取统计 (非交互式，不弹窗)
        const allNotes = await storageManager.loadAllNotes(false);

        if (allNotes) {
            const totalNotes = allNotes.reduce((sum, page) => sum + page.notes.length, 0);

            document.getElementById('totalNotes').textContent = totalNotes;
            document.getElementById('totalPages').textContent = allNotes.length;

            // 当前页
            if (tab) {
                // 简单的URL匹配
                const pageData = allNotes.find(p => p.url === tab.url || p.url.includes(tab.url) || tab.url.includes(p.url));
                document.getElementById('currentPageNotes').textContent = pageData ? pageData.notes.length : 0;
            }
        }
    } catch (e) {
        console.error('Failed to update stats', e);
    }
}
