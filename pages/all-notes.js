// ========================================
// All Notes Page 脚本
// ========================================

let allPages = [];
let currentView = 'pages';
let currentSort = 'oldest';
let searchTerm = '';
let pageViewStates = {}; // Store view mode (cards/markdown) for each page

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

    // Sort: By default oldest pages first (chronological, matching reading order)
    filteredPages.sort((a, b) => {
        const getLatest = (p) => {
            if (!p.notes || p.notes.length === 0) return 0;
            return Math.max(...p.notes.map(n => n.timestamp || 0));
        };
        const timeA = getLatest(a);
        const timeB = getLatest(b);
        return currentSort === 'oldest' ? timeA - timeB : timeB - timeA;
    });

    filteredPages.forEach(page => {
        const pageId = `page-${generateIdFromUrl(page.url)}`;
        const pageGroup = document.createElement('div');
        pageGroup.className = 'page-group';
        pageGroup.id = pageId;

        const pageTitle = page.title || page.pageTitle || page.url || '无标题页面';

        // Check if we have a saved view state for this page, default to markdown
        const savedViewMode = pageViewStates[pageId] || 'markdown';
        const isCardsActive = savedViewMode === 'cards';
        const isMarkdownActive = savedViewMode === 'markdown';

        pageGroup.innerHTML = `
            <div class="page-group-header">
                <div class="page-group-title">
                    <h2 title="${page.url}">
                        <a href="${page.url}" target="_blank" style="color:inherit;text-decoration:none;">${escapeHtml(pageTitle)}</a>
                        <button class="edit-title-btn" data-url="${page.url}" data-title="${escapeHtml(pageTitle)}" title="编辑标题">✏️</button>
                    </h2>
                    <div class="page-group-url">${page.url}</div>
                </div>
                <div class="page-group-controls">
                     <button class="btn btn-sm view-toggle-btn ${isCardsActive ? 'active' : ''}" data-mode="cards" data-page-id="${pageId}">
                        <span class="icon-cards">📄</span> 卡片
                     </button>
                     <button class="btn btn-sm view-toggle-btn ${isMarkdownActive ? 'active' : ''}" data-mode="markdown" data-page-id="${pageId}">
                        <span class="icon-md">M⬇</span> 以 Markdown 形式展示
                     </button>
                    <button class="btn btn-sm btn-view-page-content" data-url="${page.url}" title="查看该网页完整内容">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        查看该网页全部内容
                    </button>
                    <span class="page-group-count">${page.notes.length} 条笔记</span>
                </div>
            </div>
            <div class="page-group-notes" id="${pageId}-notes" style="display:${isCardsActive ? 'grid' : 'none'};"></div>
            <div class="page-group-markdown" id="${pageId}-markdown" style="display:${isMarkdownActive ? 'block' : 'none'};"></div>
        `;

        const notesGrid = pageGroup.querySelector('.page-group-notes');
        const markdownContainer = pageGroup.querySelector('.page-group-markdown');

        // Sort notes within page (oldest first, matching reading order)
        const notes = [...page.notes].sort((a, b) => a.timestamp - b.timestamp);

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

            // 判断内容是否需要截断（超过约150字符或3行）
            const needsTruncation = note.text && note.text.length > 150;
            const textClass = needsTruncation ? 'note-text note-text-truncate' : 'note-text';
            const noteNoteClass = note.note && note.note.length > 100 ? 'note-note note-note-truncate' : 'note-note';

            card.innerHTML = `
                <div class="note-header">
                    <span class="note-time">${formatDate(note.timestamp)}</span>
                    ${actionsHtml}
                </div>
                <div class="note-tags">${tagsHtml}</div>
                <div class="${textClass}" data-note-id="${note.id}">${escapeHtml(note.text)}</div>
                ${needsTruncation ? `<button class="expand-btn visible" data-note-id="${note.id}">展开全文 ▼</button>` : ''}
                ${note.note ? `<div class="${noteNoteClass}">📝 ${escapeHtml(note.note)}</div>` : ''}
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

    // Save the view state for this page
    pageViewStates[pageGroupId] = mode;

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


// Edit state
let currentEditNote = null;
let currentEditPageUrl = null;
let currentEditTitleUrl = null;

async function editNote(note, pageUrl) {
    // Store current note being edited
    currentEditNote = note;
    currentEditPageUrl = pageUrl;

    // Populate modal fields
    document.getElementById('editNoteText').value = note.text || '';
    document.getElementById('editNoteTags').value = note.tags ? note.tags.join(' ') : '';
    document.getElementById('editNoteComment').value = note.note || '';

    // Show modal
    document.getElementById('editNoteModal').style.display = 'flex';

    // Focus on text field
    document.getElementById('editNoteText').focus();
}

async function saveEditNote() {
    if (!currentEditNote || !currentEditPageUrl) return;

    const newText = document.getElementById('editNoteText').value;
    const newTags = document.getElementById('editNoteTags').value;
    const newNote = document.getElementById('editNoteComment').value;

    try {
        const result = await storageManager.updateNote(currentEditPageUrl, currentEditNote.id, {
            text: newText,
            tags: parseTags(newTags),
            note: newNote
        });

        if (result && result.success) {
            closeEditNoteModal();
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

function closeEditNoteModal() {
    document.getElementById('editNoteModal').style.display = 'none';
    currentEditNote = null;
    currentEditPageUrl = null;
}

// Edit Page Title Functions
function openEditTitleModal(url, currentTitle) {
    currentEditTitleUrl = url;
    document.getElementById('editPageTitle').value = currentTitle || '';
    document.getElementById('editPageUrl').textContent = url;
    document.getElementById('editTitleModal').style.display = 'flex';
    document.getElementById('editPageTitle').focus();
}

async function saveEditTitle() {
    if (!currentEditTitleUrl) return;

    const newTitle = document.getElementById('editPageTitle').value.trim();
    if (!newTitle) {
        showNotification('标题不能为空', 'error');
        return;
    }

    try {
        const result = await storageManager.updatePageTitle(currentEditTitleUrl, newTitle);
        if (result && result.success) {
            closeEditTitleModal();
            await loadAllNotes();
            showNotification('标题已更新', 'success');
        } else {
            showNotification('更新失败', 'error');
        }
    } catch (error) {
        console.error('Failed to update title:', error);
        showNotification('更新失败', 'error');
    }
}

function closeEditTitleModal() {
    document.getElementById('editTitleModal').style.display = 'none';
    currentEditTitleUrl = null;
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

    // View Page Content Button Delegation
    document.getElementById('notesContainer').addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-view-page-content');
        if (!btn) return;

        const pageUrl = btn.dataset.url;
        if (!pageUrl) return;

        await showPageMarkdown(pageUrl);
    });

    // Expand/Collapse Button Delegation
    document.getElementById('notesContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('.expand-btn');
        if (!btn) return;

        const noteId = btn.dataset.noteId;
        const card = btn.closest('.note-card');
        if (!card) return;

        const textDiv = card.querySelector(`.note-text-truncate[data-note-id="${noteId}"]`);
        const noteDiv = card.querySelector('.note-note-truncate');

        if (textDiv) {
            const isExpanded = textDiv.classList.toggle('expanded');
            if (noteDiv) noteDiv.classList.toggle('expanded', isExpanded);
            btn.textContent = isExpanded ? '收起 ▲' : '展开全文 ▼';
        }
    });

    // Edit Note Modal Controls
    const editNoteModal = document.getElementById('editNoteModal');
    const closeEditNoteBtn = document.getElementById('closeEditNoteModal');
    const cancelEditNoteBtn = document.getElementById('cancelEditNoteBtn');
    const saveEditNoteBtn = document.getElementById('saveEditNoteBtn');

    if (closeEditNoteBtn) {
        closeEditNoteBtn.addEventListener('click', closeEditNoteModal);
    }
    if (cancelEditNoteBtn) {
        cancelEditNoteBtn.addEventListener('click', closeEditNoteModal);
    }
    if (saveEditNoteBtn) {
        saveEditNoteBtn.addEventListener('click', saveEditNote);
    }
    if (editNoteModal) {
        editNoteModal.addEventListener('click', (e) => {
            if (e.target === editNoteModal) {
                closeEditNoteModal();
            }
        });
    }

    // Edit Title Modal Controls
    const editTitleModal = document.getElementById('editTitleModal');
    const closeEditTitleBtn = document.getElementById('closeEditTitleModal');
    const cancelEditTitleBtn = document.getElementById('cancelEditTitleBtn');
    const saveEditTitleBtn = document.getElementById('saveEditTitleBtn');

    if (closeEditTitleBtn) {
        closeEditTitleBtn.addEventListener('click', closeEditTitleModal);
    }
    if (cancelEditTitleBtn) {
        cancelEditTitleBtn.addEventListener('click', closeEditTitleModal);
    }
    if (saveEditTitleBtn) {
        saveEditTitleBtn.addEventListener('click', saveEditTitle);
    }
    if (editTitleModal) {
        editTitleModal.addEventListener('click', (e) => {
            if (e.target === editTitleModal) {
                closeEditTitleModal();
            }
        });
    }

    // Edit Title Button Delegation
    document.getElementById('notesContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('.edit-title-btn');
        if (!btn) return;

        const url = btn.dataset.url;
        const title = btn.dataset.title;
        if (url) {
            openEditTitleModal(url, title);
        }
    });

    // Markdown Viewer Modal Controls
    const markdownViewerModal = document.getElementById('markdownViewerModal');
    const closeMarkdownViewer = document.getElementById('closeMarkdownViewer');
    const copyMarkdownBtn = document.getElementById('copyMarkdownBtn');
    const downloadMarkdownBtn = document.getElementById('downloadMarkdownBtn');

    if (closeMarkdownViewer) {
        closeMarkdownViewer.addEventListener('click', () => {
            markdownViewerModal.style.display = 'none';
        });
    }

    if (markdownViewerModal) {
        markdownViewerModal.addEventListener('click', (e) => {
            if (e.target === markdownViewerModal) {
                markdownViewerModal.style.display = 'none';
            }
        });
    }

    if (copyMarkdownBtn) {
        copyMarkdownBtn.addEventListener('click', () => {
            const markdownContent = document.getElementById('markdownContent').textContent;
            navigator.clipboard.writeText(markdownContent).then(() => {
                showNotification('Markdown 已复制到剪贴板', 'success');
            }).catch(err => {
                showNotification('复制失败', 'error');
                console.error('Copy failed:', err);
            });
        });
    }

    if (downloadMarkdownBtn) {
        downloadMarkdownBtn.addEventListener('click', () => {
            const markdownContent = document.getElementById('markdownContent').textContent;
            const pageUrl = markdownViewerModal.dataset.currentUrl || 'page';
            const filename = `${sanitizeFilename(pageUrl)}.md`;
            downloadFile(markdownContent, filename, 'text/markdown');
            showNotification('Markdown 已下载', 'success');
        });
    }
}

// ========================================
// Markdown Viewer Functions
// ========================================

async function showPageMarkdown(pageUrl) {
    const modal = document.getElementById('markdownViewerModal');
    const markdownContent = document.getElementById('markdownContent');

    // Show loading state
    markdownContent.textContent = '正在提取页面内容...\n\n⏳ 请稍候...';
    modal.style.display = 'flex';
    modal.dataset.currentUrl = pageUrl;

    try {
        const response = await extractMarkdownFromUrl(pageUrl, (progress) => {
            markdownContent.textContent = '正在提取页面内容...\n\n' + progress;
        });

        if (response && response.success) {
            const markdown = response.markdown;
            // Save/overwrite the markdown
            await storageManager.savePageMarkdown(pageUrl, markdown, response.metadata);

            markdownContent.textContent = markdown;
        } else {
            throw new Error(response?.error || '提取失败');
        }

    } catch (error) {
        console.error('Failed to extract page markdown:', error);

        // Try to load saved markdown as fallback
        try {
            const savedMarkdown = await storageManager.loadPageMarkdown(pageUrl);
            if (savedMarkdown) {
                markdownContent.textContent = savedMarkdown + '\n\n---\n\n⚠️ 注意：自动提取失败，显示的是之前保存的内容。\n\n错误信息：' + error.message;
            } else {
                markdownContent.textContent = `提取失败：${error.message}\n\n💡 提示：\n1. 该网页可能需要登录或有访问限制\n2. 网页加载时间过长\n3. 内容脚本未能正确加载\n\n你可以：\n- 手动打开该网页，然后点击插件的"📄 提取页面内容"按钮\n- 或在该网页打开时再次点击此按钮`;
            }
        } catch (fallbackError) {
            markdownContent.textContent = `提取失败：${error.message}\n\n💡 提示：\n1. 该网页可能需要登录或有访问限制\n2. 网页加载时间过长\n3. 内容脚本未能正确加载\n\n你可以：\n- 手动打开该网页，然后点击插件的"📄 提取页面内容"按钮\n- 或在该网页打开时再次点击此按钮`;
        }
    }
}

function sanitizeFilename(url) {
    try {
        const urlObj = new URL(url);
        let filename = urlObj.hostname + urlObj.pathname;
        filename = filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
        filename = filename.replace(/_+/g, '_');
        filename = filename.substring(0, 100); // Limit length
        return filename || 'page';
    } catch (e) {
        return 'page';
    }
}
