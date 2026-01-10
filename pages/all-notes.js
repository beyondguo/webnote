// ========================================
// All Notes Page 脚本
// ========================================

let allPages = [];
let currentView = 'pages';
let currentSort = 'newest';
let searchTerm = '';

const DEBUG = true;

function logToConsole(msg, type = 'info') {
    if (!DEBUG) return;
    console.log(`[${type}] ${msg}`);
}

document.addEventListener('DOMContentLoaded', async () => {
    logToConsole('Page loaded. Initializing...');

    // 初始化主题
    setTheme(getCurrentTheme());

    // 加载所有笔记
    logToConsole('Starting loadAllNotes...');
    await loadAllNotes();

    // 绑定事件
    bindEvents();
});

// ========================================
// 加载笔记
// ========================================

async function loadAllNotes() {
    try {
        logToConsole('Requesting notes from storageManager...');

        // 1. Load notes (Storage manager now merges Cache + FS)
        // We can't easily hook into storageManager logs without modifying it too, 
        // but we can trust its return value or add logs there later. 
        // For now, let's just log what we get back.
        const notes = await storageManager.loadAllNotes(false); // False = non-interactive
        logToConsole(`storageManager returned ${notes ? notes.length : 'null'} pages.`);

        // 2. Check strict FS permission for status banner
        logToConsole('Checking FS permission status...');
        const hasFSAccess = await storageManager.ensureFolderAccess(false);
        logToConsole(`FS Access: ${hasFSAccess}`);

        if (notes) {
            allPages = notes;
            updateStats(); // Always update stats

            // Check for filter param
            const urlParams = new URLSearchParams(window.location.search);
            const filterUrl = urlParams.get('filter');
            if (filterUrl) {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    // If it's a URL, normalize it for better matching
                    const displayValue = filterUrl.startsWith('http') ? storageManager.normalizeUrl(filterUrl) : filterUrl;
                    searchInput.value = displayValue;
                    searchTerm = displayValue;
                    logToConsole(`Applying filter: ${displayValue}`);
                }
            }

            if (allPages.length > 0) {
                logToConsole(`Rendering ${allPages.length} pages...`);
                renderSidebar();
                renderNotes();
            } else {
                logToConsole('No pages to render.');
                // If empty, we still want to render sidebar (it will be empty but initializes filtering)
                renderSidebar();
                // But main area shows empty state if NO permission issue
                if (hasFSAccess) {
                    logToConsole('Has access but no data -> Showing Empty State');
                    showEmptyState();
                } else {
                    logToConsole('No access and no data -> Waiting plugin logic');
                }
            }

            // Permission banner logic (shows independent of empty state)
            updateSyncStatus(hasFSAccess); // Update the permanent header indicator

            if (!hasFSAccess) {
                logToConsole('Showing Permission Banner (No FS Access)');
                showPermissionBanner();
            } else {
                hidePermissionBanner();
            }
        } else {
            // Notes is null/undefined (rare)
            showEmptyState();
        }
    } catch (error) {
        console.error('Failed to load notes:', error);
        showEmptyState();
    }
}

function updateSyncStatus(hasAccess) {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;

    if (hasAccess) {
        statusEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>已同步到本地';
        statusEl.style.color = '#ffffff'; // White text on blue background
        statusEl.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        statusEl.style.padding = '4px 10px';
        statusEl.style.borderRadius = '20px';
        statusEl.style.fontWeight = '500';
        statusEl.title = '所有笔记均已保存到本地文件夹';
        statusEl.onclick = null;
        statusEl.style.cursor = 'default';
    } else {
        statusEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>未同步 (点击授权)';
        statusEl.style.color = '#ffffff';
        statusEl.style.fontWeight = 'bold';
        statusEl.title = '点击授权访问本地文件夹以启用同步';
        statusEl.style.cursor = 'pointer';

        // Make it look like a button
        statusEl.style.backgroundColor = '#fff7ed';
        statusEl.style.padding = '4px 8px';
        statusEl.style.borderRadius = '4px';
        statusEl.style.border = '1px solid #fed7aa';

        statusEl.onclick = async () => {
            const success = await storageManager.requestFolderAccess();
            if (success) {
                await loadAllNotes(); // Reload to sync
            }
        };
    }
}

function showPermissionBanner() {
    const existing = document.getElementById('permissionBanner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'permissionBanner';
    banner.style.background = '#fff7ed';
    banner.style.color = '#c2410c';
    banner.style.padding = '12px';
    banner.style.textAlign = 'center';
    banner.style.borderBottom = '1px solid #fed7aa';
    banner.innerHTML = `
        <strong>⚠️ 未同步到本地文件</strong> 
        <span style="font-size:14px; margin: 0 8px;">您正在查看缓存的笔记。要保存到本地文件，请授权访问文件夹。</span>
        <button id="bannerGrantBtn" class="btn btn-sm btn-primary" style="padding: 4px 12px; font-size: 12px;">授权同步</button>
    `;

    const container = document.querySelector('.page-container');
    const header = document.querySelector('.page-header');
    if (container && header) {
        container.insertBefore(banner, header.nextSibling); // Insert below header
    }

    document.getElementById('bannerGrantBtn').addEventListener('click', async () => {
        const success = await storageManager.requestFolderAccess();
        if (success) {
            hidePermissionBanner();
            await loadAllNotes(); // Reload to sync
        }
    });
}

function hidePermissionBanner() {
    const banner = document.getElementById('permissionBanner');
    if (banner) banner.remove();
}

function showPermissionRequest() {
    const container = document.getElementById('notesContainer');
    document.getElementById('emptyState').style.display = 'none';

    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.height = '100%';

    container.innerHTML = `
        <div class="empty-state">
            <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
            <h2 style="margin-bottom: 8px;">需要文件夹访问权限</h2>
            <p style="color: var(--text-secondary); margin-bottom: 24px;">要查看本地文件中的笔记，请授权访问。</p>
            <button id="grantPermissionBtn" class="btn btn-primary">
                点击授权
            </button>
        </div>
    `;

    const btn = document.getElementById('grantPermissionBtn');
    if (btn) {
        btn.addEventListener('click', async () => {
            const success = await storageManager.requestFolderAccess();
            if (success) {
                container.innerHTML = '<div class="loading">加载笔记中...</div>';
                container.style = '';
                await loadAllNotes();
            }
        });
    }
}

// ========================================
// 渲染所有的UI函数
// ========================================

function updateStats() {
    const totalPages = allPages.length;
    const totalNotes = allPages.reduce((sum, p) => sum + (p.notes ? p.notes.length : 0), 0);

    const totalPagesEl = document.getElementById('totalPages');
    const totalNotesEl = document.getElementById('totalNotes');

    if (totalPagesEl) totalPagesEl.textContent = totalPages;
    if (totalNotesEl) totalNotesEl.textContent = totalNotes;
}

function renderSidebar() {
    const pagesList = document.getElementById('pagesList');
    const tagsList = document.getElementById('tagsList');

    if (!pagesList || !tagsList) return;

    // Render Pages List
    pagesList.innerHTML = '';
    if (allPages.length === 0) {
        pagesList.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;">无页面</div>';
    } else {
        allPages.forEach(page => {
            const item = document.createElement('div');
            item.className = 'page-item';

            // Normalize URLs for comparison
            const normalizedPageUrl = storageManager.normalizeUrl(page.url).toLowerCase();
            const normalizedSearchTerm = searchTerm.startsWith('http') ? storageManager.normalizeUrl(searchTerm).toLowerCase() : searchTerm.toLowerCase();

            if (normalizedPageUrl === normalizedSearchTerm) {
                item.classList.add('active');
            }

            // Title Fallback: PageTitle -> Title -> URL -> 'Untitled'
            const displayTitle = page.pageTitle || page.title || page.url || '无标题页面';

            item.innerHTML = `
            <div class="page-item-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
            <div class="page-item-count">${page.notes ? page.notes.length : 0}</div>
        `;

            item.onclick = (e) => {
                e.stopPropagation();
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    const normalizedUrl = storageManager.normalizeUrl(page.url);
                    searchInput.value = normalizedUrl;
                    searchTerm = normalizedUrl;
                    renderNotes();
                    renderSidebar();
                }
            };
            pagesList.appendChild(item);
        });
    }

    // Render Tags List
    tagsList.innerHTML = '';
    const tagsMap = new Map();
    allPages.forEach(page => {
        if (page.notes) {
            page.notes.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => {
                        tagsMap.set(tag, (tagsMap.get(tag) || 0) + 1);
                    });
                }
            });
        }
    });

    if (tagsMap.size === 0) {
        tagsList.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;">无标签</div>';
    } else {
        // Sort alphabetically
        Array.from(tagsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, count]) => {
            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            // Use generic style for all tags to match user request (light bg, dark text)
            // chip.style.backgroundColor = getTagColor(tag); // Removed dynamic color
            chip.textContent = `${tag} (${count})`;
            chip.onclick = () => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = tag;
                    searchInput.dispatchEvent(new Event('input'));
                }
            };
            tagsList.appendChild(chip);
        });
    }
}

function renderNotes() {
    const container = document.getElementById('notesContainer');
    if (!container) return;

    container.innerHTML = '';

    // Filter logic
    let filteredPages = allPages;
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        const normalizedSearchTerm = storageManager.normalizeUrl(searchTerm).toLowerCase();

        filteredPages = allPages.map(page => {
            const normalizedPageUrl = storageManager.normalizeUrl(page.url).toLowerCase();
            const isUrlMatch = searchTerm.startsWith('http') && normalizedPageUrl === normalizedSearchTerm;

            // If it's a direct URL match (from sidebar or full URL search), show ALL notes
            // Otherwise, filter notes by the search term
            const matchingNotes = isUrlMatch ? (page.notes || []) : (page.notes || []).filter(note =>
                (note.text && note.text.toLowerCase().includes(lowerTerm)) ||
                (note.tags && note.tags.some(t => t.toLowerCase().includes(lowerTerm))) ||
                (note.note && note.note.toLowerCase().includes(lowerTerm))
            );

            const pageMatchesTerm =
                ((page.pageTitle || page.title || '').toLowerCase().includes(lowerTerm)) ||
                (page.url && page.url.toLowerCase().includes(lowerTerm)) ||
                (page.url && storageManager.normalizeUrl(page.url).toLowerCase().includes(normalizedSearchTerm));

            return { ...page, notes: matchingNotes, pageMatchesTerm };
        }).filter(page => page.pageMatchesTerm || page.notes.length > 0);
    }

    if (filteredPages.length === 0) {
        if (searchTerm) {
            container.innerHTML = '<div class="empty-state"><p>未找到匹配的笔记</p></div>';
        } else {
            // Should be handled by loadAllNotes empty state, but just in case
            container.innerHTML = '<div class="empty-state"><p>没有笔记</p></div>';
        }
        return;
    }

    // Sort: Newest pages first (based on latest note)
    filteredPages.sort((a, b) => {
        const getLatest = (p) => {
            if (!p.notes || p.notes.length === 0) return 0;
            return Math.max(...p.notes.map(n => n.timestamp || 0));
        };
        const timeA = getLatest(a);
        const timeB = getLatest(b);
        return currentSort === 'newest' ? timeB - timeA : timeA - timeB;
    });

    filteredPages.forEach(page => {
        const pageId = `page-${generateIdFromUrl(page.url)}`;
        const pageGroup = document.createElement('div');
        pageGroup.className = 'page-group';
        pageGroup.id = pageId;

        const pageTitle = page.title || page.pageTitle || page.url || '无标题页面';

        pageGroup.innerHTML = `
            <div class="page-group-header">
                <div class="page-group-title">
                    <h2 title="${page.url}"><a href="${page.url}" target="_blank" style="color:inherit;text-decoration:none;hover:text-decoration:underline;">${escapeHtml(pageTitle)}</a></h2>
                    <div class="page-group-url">${page.url}</div>
                </div>
                <div class="page-group-controls">
                     <button class="btn btn-sm view-toggle-btn" data-mode="cards" data-page-id="${pageId}">
                        <span class="icon-cards">📄</span> 卡片
                     </button>
                     <button class="btn btn-sm view-toggle-btn active" data-mode="markdown" data-page-id="${pageId}">
                        <span class="icon-md">M⬇</span> 以 Markdown 形式展示
                     </button>
                    <span class="page-group-count">${page.notes.length} 条笔记</span>
                </div>
            </div>
            <div class="page-group-notes" id="${pageId}-notes" style="display:none;"></div>
            <div class="page-group-markdown" id="${pageId}-markdown"></div>
        `;

        const notesGrid = pageGroup.querySelector('.page-group-notes');
        const markdownContainer = pageGroup.querySelector('.page-group-markdown');

        // Sort notes within page
        const notes = [...page.notes].sort((a, b) => b.timestamp - a.timestamp);

        // Render Cards
        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';

            // Format Tags
            const tagsHtml = (note.tags || []).map(tag =>
                `<span class="note-tag" style="background-color: ${getTagColor(tag)}">${tag}</span>`
            ).join('');

            // Note Actions
            const actionsHtml = `
                <div class="note-actions">
                    <button class="note-action-btn edit-btn" data-url="${page.url}" data-id="${note.id}" title="编辑">✏️</button>
                    <button class="note-action-btn delete-btn" data-url="${page.url}" data-id="${note.id}" title="删除">🗑️</button>
                </div>
            `;

            card.innerHTML = `
                <div class="note-header">
                    <span class="note-time">${formatDate(note.timestamp)}</span>
                    ${actionsHtml}
                </div>
                <div class="note-tags">${tagsHtml}</div>
                <div class="note-text">${escapeHtml(note.text)}</div>
                ${note.note ? `<div class="note-note">📝 ${escapeHtml(note.note)}</div>` : ''}
            `;

            notesGrid.appendChild(card);
        });

        // Render Markdown View (as HTML styled like a doc)
        let markdownHtml = '';
        notes.forEach(note => {
            const timeStr = new Date(note.timestamp).toLocaleString();
            // Render tags as HTML pills, similar to card view
            const tagsHtml = (note.tags || []).map(tag =>
                `<span class="tag-chip" style="display:inline-flex; transform:none; margin:0 2px; font-size:10px; padding:2px 8px;">${tag}</span>`
            ).join('');

            // Format layout: Time | Tags
            const metaContent = `<span style="opacity:0.8">${timeStr}</span>` +
                (tagsHtml ? `<span style="margin:0 8px; opacity:0.3">|</span>${tagsHtml}` : '');

            markdownHtml += `
                <div class="md-entry">
                    <div class="md-meta">${metaContent}</div>
                    <div class="md-content">${escapeHtml(note.text)}</div>
                    ${note.note ? `<div class="md-comment">Note: ${escapeHtml(note.note)}</div>` : ''}
                </div>
            `;
        });
        markdownContainer.innerHTML = markdownHtml;

        container.appendChild(pageGroup);
    });
}

// Global function for layout toggling
function togglePageView(pageGroupId, mode) {
    const group = document.getElementById(pageGroupId);
    if (!group) return;

    const notesDiv = group.querySelector('.page-group-notes');
    const mdDiv = group.querySelector('.page-group-markdown');
    const buttons = group.querySelectorAll('.view-toggle-btn');

    // Update buttons state
    buttons.forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (mode === 'markdown') {
        notesDiv.style.display = 'none';
        mdDiv.style.display = 'block';
    } else {
        notesDiv.style.display = 'grid';
        mdDiv.style.display = 'none';
    }
}

// Helper to generate safe ID from URL
function generateIdFromUrl(url) {
    return url.replace(/[^a-zA-Z0-9]/g, '_');
}


async function editNote(note, pageUrl) {
    const newText = prompt('编辑文本:', note.text);
    if (newText === null) return;

    const newTags = prompt('编辑标签 (空格分隔):', note.tags ? note.tags.join(' ') : '');
    if (newTags === null) return;

    const newNote = prompt('编辑备注:', note.note || '');
    if (newNote === null) return;

    try {
        // 直接使用 storageManager
        const result = await storageManager.updateNote(pageUrl, note.id, {
            text: newText,
            tags: parseTags(newTags),
            note: newNote
        });

        if (result && result.success) {
            await loadAllNotes();
            showNotification('笔记已更新', 'success');
        } else {
            showNotification('更新失败', 'error');
        }
    } catch (error) {
        console.error('Failed to update note:', error);
        showNotification('更新失败', 'error');
    }
}

async function deleteNote(note, pageUrl) {
    if (!confirm('确定要删除这条笔记吗？')) {
        return;
    }

    try {
        // 直接使用 storageManager
        const result = await storageManager.deleteNote(pageUrl, note.id);

        if (result && result.success) {
            await loadAllNotes();
            showNotification('笔记已删除', 'success');
        } else {
            showNotification('删除失败', 'error');
        }
    } catch (error) {
        console.error('Failed to delete note:', error);
        showNotification('删除失败', 'error');
    }
}

// ========================================
// 导出功能
// ========================================

function showExportModal() {
    document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

function exportAsMarkdown() {
    const markdown = exportAllToMarkdown(allPages);
    const filename = `web-notes-${new Date().toISOString().split('T')[0]}.md`;
    downloadFile(markdown, filename, 'text/markdown');
    closeExportModal();
    showNotification('导出成功！', 'success');
}

function exportAsJSON() {
    const json = JSON.stringify(allPages, null, 2);
    const filename = `web-notes-${new Date().toISOString().split('T')[0]}.json`;
    downloadFile(json, filename, 'application/json');
    closeExportModal();
    showNotification('导出成功！', 'success');
}

// ========================================
// 空状态
// ========================================

function showEmptyState() {
    document.getElementById('notesContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
}

// ========================================
// 事件绑定
// ========================================

function bindEvents() {
    // 主题切换
    document.getElementById('themeToggle').addEventListener('click', () => {
        toggleTheme();
    });

    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderNotes();
    });

    // 视图切换
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            renderNotes();
        });
    });

    // 排序
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderNotes();
    });



    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', showExportModal);

    // 导出模态框关闭
    const modalCloseBtn = document.querySelector('.modal-close');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeExportModal);

    // Markdown 导出
    const exportMdBtn = document.querySelector('button[onclick="exportAsMarkdown()"]');
    // Wait, I should select by content or class if onclick is removed from HTML. 
    // Let's assume I will replace HTML invalid onclicks. 
    // Better strategy: Add IDs to these buttons in HTML or select by parent.
    // I will replace HTML next, so I will add IDs there: id="btnExportMd", id="btnExportJson".
    // For now, I'll use a more generic selector or assume IDs will be added.

    // Let's assume ids will be added
    const btnExportMd = document.getElementById('btnExportMd');
    if (btnExportMd) btnExportMd.addEventListener('click', exportAsMarkdown);

    const btnExportJson = document.getElementById('btnExportJson');
    if (btnExportJson) btnExportJson.addEventListener('click', exportAsJSON);

    // 点击遮罩关闭对话框
    document.getElementById('exportModal').addEventListener('click', (e) => {
        if (e.target.id === 'exportModal') {
            closeExportModal();
        }
    });

    // View Toggle Delegation (Cards/Markdown)
    document.getElementById('notesContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('.view-toggle-btn');
        if (btn) {
            const pageId = btn.dataset.pageId;
            const mode = btn.dataset.mode;
            if (pageId && mode) {
                togglePageView(pageId, mode);
            }
        }
    });

    // Note Actions Delegation (Edit/Delete)
    document.getElementById('notesContainer').addEventListener('click', async (e) => {
        const btn = e.target.closest('.note-action-btn');
        if (!btn) return;

        const pageUrl = btn.dataset.url;
        const noteId = btn.dataset.id;
        if (!pageUrl || !noteId) return;

        // Find note object
        const page = allPages.find(p => p.url === pageUrl);
        if (!page) return;

        const note = page.notes.find(n => n.id === noteId);
        if (!note) return;

        if (btn.classList.contains('edit-btn')) {
            await editNote(note, pageUrl);
        } else if (btn.classList.contains('delete-btn')) {
            await deleteNote(note, pageUrl);
        }
    });
}
