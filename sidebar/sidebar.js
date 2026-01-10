// ========================================
// Sidebar 脚本
// ========================================

let allPages = [];
let filteredNotes = [];
let currentFilter = 'current'; // 'current' or 'all'
let currentUrl = '';
let searchTerm = '';

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化主题
    setTheme(getCurrentTheme());

    // 获取当前窗口的URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        currentUrl = tab.url;
    }

    // 初始加载
    await loadNotes();

    // 绑定事件
    bindEvents();
});

async function loadNotes() {
    try {
        const notes = await storageManager.loadAllNotes(false);
        allPages = notes || [];
        renderSidebar();
    } catch (error) {
        console.error('Failed to load notes in sidebar:', error);
        document.getElementById('notesList').innerHTML = '<div class="error">加载失败</div>';
    }
}

function renderSidebar() {
    const listContainer = document.getElementById('notesList');
    if (!listContainer) return;

    // 收集需要显示的笔记
    let notesToShow = [];

    if (currentFilter === 'current') {
        const page = allPages.find(p => storageManager.normalizeUrl(p.url) === storageManager.normalizeUrl(currentUrl));
        if (page) notesToShow = page.notes.map(n => ({ ...n, pageTitle: page.pageTitle, url: page.url }));
    } else {
        allPages.forEach(page => {
            page.notes.forEach(note => {
                notesToShow.push({ ...note, pageTitle: page.pageTitle, url: page.url });
            });
        });
    }

    // 搜索过滤
    if (searchTerm) {
        const lowTerm = searchTerm.toLowerCase();
        notesToShow = notesToShow.filter(n =>
            n.text.toLowerCase().includes(lowTerm) ||
            (n.note && n.note.toLowerCase().includes(lowTerm)) ||
            (n.tags && n.tags.some(t => t.toLowerCase().includes(lowTerm)))
        );
    }

    // 排序（按时间倒序）
    notesToShow.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 渲染
    if (notesToShow.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">${searchTerm ? '未找到匹配结果' : '暂无笔记'}</div>`;
        return;
    }

    listContainer.innerHTML = '';
    notesToShow.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-item';

        const tagsHtml = (note.tags || []).map(tag =>
            `<span class="note-tag" style="background-color: ${getTagColor(tag)}; font-size: 10px; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${tag}</span>`
        ).join('');

        item.innerHTML = `
            <div class="note-content">${escapeHtml(note.text)}</div>
            ${note.note ? `<div class="note-note" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">📝 ${escapeHtml(note.note)}</div>` : ''}
            <div class="note-tags" style="margin-bottom: 8px;">${tagsHtml}</div>
            <div class="note-meta">
                <span>${formatDate(note.timestamp)}</span>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function bindEvents() {
    // 主题切换
    document.getElementById('themeToggle').addEventListener('click', () => {
        const next = toggleTheme();
        // 这里的逻辑可以更精细
    });

    //在新标签页打开
    document.getElementById('openFullPage').addEventListener('click', () => {
        chrome.tabs.create({ url: 'pages/all-notes.html' });
    });

    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderSidebar();
    });

    // 标签切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderSidebar();
        });
    });
}
