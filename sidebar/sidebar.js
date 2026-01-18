// ========================================
// Sidebar Script - Notes + AI Chat
// ========================================

// Notes State
let allPages = [];
let filteredNotes = [];
let currentFilter = 'current';
let currentUrl = '';
let searchTerm = '';

// AI Chat State
let chatHistory = [];
let pageContent = '';
let pageMetadata = {};
let isProcessing = false;
let chatInitialized = false;
let currentTabId = null;

// Note saving state
let currentSelection = null;
let saveDialog = null;

// System prompt for the AI
const SYSTEM_PROMPT = `你是一个智能阅读助手，帮助用户理解和讨论网页内容。

你的职责：
1. 仔细阅读并理解用户提供的网页内容
2. 根据用户的问题，提供准确、有帮助的回答
3. 如果用户问题超出网页内容范围，友好地告知并尽可能提供相关帮助
4. 回答要简洁明了，使用中文

请注意：
- 始终基于提供的网页内容回答问题
- 如果网页内容中没有相关信息，诚实说明
- 保持友好、专业的语气`;

// ========================================
// Chat Session Cache
// ========================================

const CHAT_CACHE_KEY = 'ai_chat_sessions';
const MAX_CACHED_SESSIONS = 20;

async function saveChatSession(url, data) {
    try {
        const result = await chrome.storage.local.get(CHAT_CACHE_KEY);
        const sessions = result[CHAT_CACHE_KEY] || {};

        // Save session data keyed by normalized URL
        const normalizedUrl = storageManager.normalizeUrl(url);
        sessions[normalizedUrl] = {
            chatHistory: data.chatHistory,
            pageContent: data.pageContent,
            pageMetadata: data.pageMetadata,
            messages: data.messages,
            timestamp: Date.now()
        };

        // Limit cache size by removing oldest entries
        const urls = Object.keys(sessions);
        if (urls.length > MAX_CACHED_SESSIONS) {
            const sorted = urls.sort((a, b) => sessions[a].timestamp - sessions[b].timestamp);
            const toRemove = sorted.slice(0, urls.length - MAX_CACHED_SESSIONS);
            toRemove.forEach(url => delete sessions[url]);
        }

        await chrome.storage.local.set({ [CHAT_CACHE_KEY]: sessions });
    } catch (e) {
        console.error('Failed to save chat session:', e);
    }
}

async function loadChatSession(url) {
    try {
        const result = await chrome.storage.local.get(CHAT_CACHE_KEY);
        const sessions = result[CHAT_CACHE_KEY] || {};
        const normalizedUrl = storageManager.normalizeUrl(url);
        return sessions[normalizedUrl] || null;
    } catch (e) {
        console.error('Failed to load chat session:', e);
        return null;
    }
}

async function clearChatSession(url) {
    try {
        const result = await chrome.storage.local.get(CHAT_CACHE_KEY);
        const sessions = result[CHAT_CACHE_KEY] || {};
        const normalizedUrl = storageManager.normalizeUrl(url);
        delete sessions[normalizedUrl];
        await chrome.storage.local.set({ [CHAT_CACHE_KEY]: sessions });
    } catch (e) {
        console.error('Failed to clear chat session:', e);
    }
}

function getCurrentMessages() {
    const container = document.getElementById('messagesContainer');
    const messageEls = container.querySelectorAll('.message');
    const messages = [];
    messageEls.forEach(el => {
        const role = el.classList.contains('user') ? 'user' : 'ai';
        const content = el.querySelector('.message-content')?.textContent || '';
        if (content) {
            messages.push({ role, content });
        }
    });
    return messages;
}

function restoreMessages(messages) {
    const container = document.getElementById('messagesContainer');
    // Clear welcome and loading
    container.innerHTML = '';

    messages.forEach(msg => {
        addMessage(msg.role, msg.content);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    setTheme(getCurrentTheme());

    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        currentUrl = tab.url;
        currentTabId = tab.id;

        // Update AI page info
        document.getElementById('aiPageTitle').textContent = tab.title || '未知页面';
        document.getElementById('aiPageUrl').textContent = tab.url;
    }

    // Load notes
    await loadNotes();

    // Bind events
    bindEvents();

    // Check URL parameter for tab to open
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'ai') {
        switchToTab('ai');
        // Auto-start chat if requested
        if (urlParams.get('autostart') === 'true') {
            startAIChat();
        }
    }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'switch-to-ai-tab') {
            switchToTab('ai');
            // Auto-start if not already initialized
            if (!chatInitialized) {
                startAIChat();
            }
            sendResponse({ success: true });
        } else if (message.action === 'save-note-from-context') {
            // Handle save note from context menu
            currentSelection = {
                text: message.selectedText,
                range: null
            };
            showSaveDialog();
            sendResponse({ success: true });
        }
        return true;
    });
});

// ========================================
// Tab Navigation
// ========================================

function switchToTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.main-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab views
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.toggle('active', view.id === `${tabName}View`);
    });

    // If switching to AI and not initialized, update page info
    if (tabName === 'ai' && currentTabId) {
        updateAIPageInfo();
    }
}

async function updateAIPageInfo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            currentUrl = tab.url;
            currentTabId = tab.id;
            document.getElementById('aiPageTitle').textContent = tab.title || '未知页面';
            document.getElementById('aiPageUrl').textContent = tab.url;
        }
    } catch (e) {
        console.error('Failed to update page info:', e);
    }
}

// ========================================
// Notes Functions
// ========================================

async function loadNotes() {
    try {
        const notes = await storageManager.loadAllNotes(false);
        allPages = notes || [];
        renderNotes();
    } catch (error) {
        console.error('Failed to load notes in sidebar:', error);
        document.getElementById('notesList').innerHTML = '<div class="error">加载失败</div>';
    }
}

function renderNotes() {
    const listContainer = document.getElementById('notesList');
    if (!listContainer) return;

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

    // Search filter
    if (searchTerm) {
        const lowTerm = searchTerm.toLowerCase();
        notesToShow = notesToShow.filter(n =>
            n.text.toLowerCase().includes(lowTerm) ||
            (n.note && n.note.toLowerCase().includes(lowTerm)) ||
            (n.tags && n.tags.some(t => t.toLowerCase().includes(lowTerm)))
        );
    }

    // Sort by time (newest first)
    notesToShow.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (notesToShow.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">${searchTerm ? '未找到匹配结果' : '暂无笔记'}</div>`;
        return;
    }

    listContainer.innerHTML = '';
    notesToShow.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-item';

        const tagsHtml = (note.tags || []).map(tag =>
            `<span class="note-tag" style="background-color: ${getTagColor(tag)}; font-size: 10px; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${escapeHtml(tag)}</span>`
        ).join('');

        item.innerHTML = `
            <div class="note-content">${escapeHtml(note.text)}</div>
            ${note.note ? `<div class="note-note" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">📝 ${escapeHtml(note.note)}</div>` : ''}
            <div class="note-tags" style="margin-bottom: 6px;">${tagsHtml}</div>
            <div class="note-meta">
                <span>${formatDate(note.timestamp)}</span>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

// ========================================
// AI Chat Functions
// ========================================

async function startAIChat() {
    // Check AI configuration first
    const isConfigured = await AIService.isAIConfigured();
    if (!isConfigured) {
        showErrorModal('请先配置 API Key 才能使用 AI 功能。');
        return;
    }

    // Get current tab info first
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        showErrorModal('无法获取当前页面');
        return;
    }

    currentTabId = tab.id;
    const pageUrl = tab.url;
    const pageTitle = tab.title || '未知页面';

    document.getElementById('aiPageTitle').textContent = pageTitle;
    document.getElementById('aiPageUrl').textContent = pageUrl;

    // Check for cached session first
    const cachedSession = await loadChatSession(pageUrl);
    if (cachedSession && cachedSession.messages && cachedSession.messages.length > 0) {
        console.log('Restoring cached chat session for:', pageUrl);

        // Restore state
        chatHistory = cachedSession.chatHistory || [];
        pageContent = cachedSession.pageContent || '';
        pageMetadata = cachedSession.pageMetadata || {};
        chatInitialized = true;

        // Hide welcome
        document.getElementById('aiWelcome').style.display = 'none';

        // Show content preview if we have content
        if (pageContent) {
            const previewSection = document.getElementById('contentPreviewSection');
            previewSection.style.display = 'block';
            document.getElementById('contentLength').textContent = `(${(pageContent.length / 1024).toFixed(1)} KB)`;
            document.getElementById('contentPreviewText').textContent = pageContent;
        }

        // Restore messages
        restoreMessages(cachedSession.messages);

        // Enable input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('messageInput').focus();
        return;
    }

    // No cache, start fresh
    document.getElementById('aiWelcome').style.display = 'none';
    showLoading('正在提取页面内容...');

    try {
        // Extract content
        const response = await extractMarkdownFromUrl(pageUrl, (progress) => {
            showLoading(progress);
        });

        if (response && response.success) {
            pageContent = response.markdown;
            pageMetadata = response.metadata || {};

            // Show content preview
            const previewSection = document.getElementById('contentPreviewSection');
            previewSection.style.display = 'block';
            document.getElementById('contentLength').textContent = `(${(pageContent.length / 1024).toFixed(1)} KB)`;
            document.getElementById('contentPreviewText').textContent = pageContent;
        } else {
            // Fallback content
            pageContent = `页面标题: ${pageTitle}\n页面地址: ${pageUrl}\n\n[无法提取页面详细内容]\n\n错误信息: ${response?.error || '未知错误'}`;

            const previewSection = document.getElementById('contentPreviewSection');
            previewSection.style.display = 'block';
            document.getElementById('contentLength').textContent = '(提取失败)';
            document.getElementById('contentPreviewText').textContent = pageContent;
        }

        hideLoading();
        chatInitialized = true;

        // Enable input
        document.getElementById('messageInput').disabled = false;

        // Start conversation
        await startConversation();

    } catch (error) {
        console.error('Failed to start AI chat:', error);
        hideLoading();
        showErrorModal('初始化失败: ' + error.message);
    }
}

async function startConversation() {
    showTypingIndicator();

    chatHistory = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content: `请仔细阅读以下网页内容，然后用简洁的语言总结主要内容（100-200字），最后问我"有什么我们可以讨论的？"

网页内容：
${pageContent}`
        }
    ];

    try {
        let aiResponse = '';
        const messageEl = createAIMessage();

        await AIService.chatWithAIStream(chatHistory, (chunk) => {
            aiResponse += chunk;
            updateMessageContent(messageEl, aiResponse);
            scrollToBottom();
        });

        chatHistory.push({ role: 'assistant', content: aiResponse });
        document.getElementById('messageInput').focus();

        // Save session to cache
        await saveChatSession(currentUrl, {
            chatHistory,
            pageContent,
            pageMetadata,
            messages: getCurrentMessages()
        });

    } catch (error) {
        console.error('AI response failed:', error);
        hideTypingIndicator();
        addMessage('ai', '抱歉，AI 响应失败：' + error.message);
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message || isProcessing || !chatInitialized) return;

    isProcessing = true;
    document.getElementById('sendBtn').disabled = true;

    addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    chatHistory.push({ role: 'user', content: message });
    showTypingIndicator();

    try {
        let aiResponse = '';
        const messageEl = createAIMessage();

        await AIService.chatWithAIStream(chatHistory, (chunk) => {
            aiResponse += chunk;
            updateMessageContent(messageEl, aiResponse);
            scrollToBottom();
        });

        chatHistory.push({ role: 'assistant', content: aiResponse });

        // Save session to cache after each message
        await saveChatSession(currentUrl, {
            chatHistory,
            pageContent,
            pageMetadata,
            messages: getCurrentMessages()
        });

    } catch (error) {
        console.error('AI response failed:', error);
        hideTypingIndicator();
        addMessage('ai', '抱歉，请求失败：' + error.message);
    } finally {
        isProcessing = false;
        document.getElementById('sendBtn').disabled = !input.value.trim();
    }
}

function addMessage(role, content) {
    const container = document.getElementById('messagesContainer');
    const message = document.createElement('div');
    message.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '‍👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Render markdown for AI messages, plain text for user
    if (role === 'ai') {
        contentDiv.innerHTML = renderMarkdown(content);
    } else {
        contentDiv.textContent = content;
    }

    message.appendChild(avatar);
    message.appendChild(contentDiv);
    container.appendChild(message);

    scrollToBottom();
}

function createAIMessage() {
    hideTypingIndicator();

    const container = document.getElementById('messagesContainer');
    const message = document.createElement('div');
    message.className = 'message ai';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = '';

    message.appendChild(avatar);
    message.appendChild(contentDiv);
    container.appendChild(message);

    return contentDiv;
}

function updateMessageContent(element, content) {
    // Render markdown for streaming AI responses
    element.innerHTML = renderMarkdown(content);
}

/**
 * Render markdown content to HTML using marked.js
 */
function renderMarkdown(content) {
    if (!content) return '';

    try {
        // Configure marked for safe rendering
        marked.setOptions({
            breaks: true,      // Convert \n to <br>
            gfm: true,         // GitHub Flavored Markdown
            headerIds: false,  // Don't generate IDs for headers
            mangle: false      // Don't mangle email addresses
        });

        return marked.parse(content);
    } catch (e) {
        console.error('Markdown render error:', e);
        return escapeHtml(content);
    }
}

function showLoading(text) {
    const indicator = document.getElementById('loadingIndicator');
    indicator.querySelector('.loading-text').textContent = text;
    indicator.classList.remove('hidden');
}

function hideLoading() {
    const indicator = document.getElementById('loadingIndicator');
    indicator.classList.add('hidden');
}

function showTypingIndicator() {
    const container = document.getElementById('messagesContainer');
    hideTypingIndicator();

    const indicator = document.createElement('div');
    indicator.className = 'message ai';
    indicator.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🤖';

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';

    indicator.appendChild(avatar);
    indicator.appendChild(typing);
    container.appendChild(indicator);

    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function showErrorModal(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').classList.add('show');
}

function hideErrorModal() {
    document.getElementById('errorModal').classList.remove('show');
}

// ========================================
// Event Bindings
// ========================================

function bindEvents() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
        toggleTheme();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    });

    // Main tab navigation
    document.querySelectorAll('.main-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            switchToTab(btn.dataset.tab);
        });
    });

    // Open full page (notes)
    document.getElementById('openFullPage').addEventListener('click', () => {
        chrome.tabs.create({ url: 'pages/all-notes.html' });
    });

    // Notes search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderNotes();
    });

    // Notes filter tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderNotes();
        });
    });

    // AI Chat - Start button
    document.getElementById('startChatBtn').addEventListener('click', () => {
        startAIChat();
    });

    // AI Chat - New chat button (clears cache and starts fresh)
    document.getElementById('newChatBtn').addEventListener('click', async () => {
        if (currentUrl) {
            await clearChatSession(currentUrl);
        }
        resetChat();
        startAIChat();
    });

    // AI Chat - Content preview toggle
    document.getElementById('contentPreviewToggle').addEventListener('click', () => {
        const toggle = document.getElementById('contentPreviewToggle');
        const body = document.getElementById('contentPreviewBody');
        toggle.classList.toggle('expanded');
        body.classList.toggle('expanded');
    });

    // AI Chat - Send button
    document.getElementById('sendBtn').addEventListener('click', sendMessage);

    // AI Chat - Input handling
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        document.getElementById('sendBtn').disabled = !input.value.trim() || isProcessing || !chatInitialized;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.value.trim() && !isProcessing && chatInitialized) {
                sendMessage();
            }
        }
    });

    // Modal buttons
    document.getElementById('goToSettings').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        hideErrorModal();
    });

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        try {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (tab) {
                currentUrl = tab.url;
                currentTabId = tab.id;
                renderNotes();

                // Update AI page info if on AI tab
                if (document.querySelector('.main-tab[data-tab="ai"]').classList.contains('active')) {
                    document.getElementById('aiPageTitle').textContent = tab.title || '未知页面';
                    document.getElementById('aiPageUrl').textContent = tab.url;

                    // Reset chat if page changed
                    if (chatInitialized) {
                        resetChat();
                    }
                }
            }
        } catch (e) {
            // Tab might have been closed
        }
    });
}

function resetChat() {
    chatInitialized = false;
    chatHistory = [];
    pageContent = '';

    document.getElementById('aiWelcome').style.display = 'flex';
    document.getElementById('contentPreviewSection').style.display = 'none';
    document.getElementById('messagesContainer').innerHTML = `
        <div class="ai-welcome" id="aiWelcome">
            <div class="welcome-icon">🤖</div>
            <p>点击下方按钮开始与 AI 讨论当前页面</p>
            <button class="btn btn-primary" id="startChatBtn">开始对话</button>
        </div>
        <div class="loading-indicator hidden" id="loadingIndicator">
            <div class="loading-dots"><span></span><span></span><span></span></div>
            <span class="loading-text">正在阅读页面内容...</span>
        </div>
    `;

    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;

    // Re-bind start chat button
    document.getElementById('startChatBtn').addEventListener('click', () => {
        startAIChat();
    });
}

// ========================================
// Note Saving Functions (for sidebar)
// ========================================

function createSaveDialog() {
    const dialog = document.createElement('div');
    dialog.id = 'web-notes-save-dialog';
    dialog.className = 'web-notes-dialog-overlay';

    dialog.innerHTML = `
      <div class="web-notes-dialog fade-in">
        <div class="web-notes-dialog-header">
          <h3>保存笔记</h3>
          <button class="web-notes-close-btn" title="关闭">×</button>
        </div>
        
        <div class="web-notes-dialog-body">
          <div class="web-notes-form-group">
            <label id="web-notes-selected-label">选中的文本</label>
            <div class="web-notes-selected-text" aria-labelledby="web-notes-selected-label" role="textbox" aria-readonly="true"></div>
          </div>
          
          <div class="web-notes-form-group">
            <label for="web-notes-tags-id">标签 <span class="web-notes-hint">(用空格分隔多个标签)</span></label>
            <input type="text" id="web-notes-tags-id" name="tags" class="web-notes-tags-input" placeholder="例如: 工作 重要 学习">
            <div class="web-notes-existing-tags"></div>
          </div>
          
          <div class="web-notes-form-group">
            <label for="web-notes-note-id">备注 <span class="web-notes-hint">(可选)</span></label>
            <textarea id="web-notes-note-id" name="note" class="web-notes-note-input" placeholder="添加额外的备注..." rows="3"></textarea>
          </div>
        </div>
        
        <div class="web-notes-dialog-footer">
          <button class="web-notes-btn web-notes-btn-secondary web-notes-cancel-btn">取消</button>
          <button class="web-notes-btn web-notes-btn-primary web-notes-save-confirm-btn">保存</button>
        </div>
      </div>
    `;

    // Event listeners
    const closeBtn = dialog.querySelector('.web-notes-close-btn');
    const cancelBtn = dialog.querySelector('.web-notes-cancel-btn');
    const saveBtn = dialog.querySelector('.web-notes-save-confirm-btn');

    closeBtn.addEventListener('click', hideSaveDialog);
    cancelBtn.addEventListener('click', hideSaveDialog);
    saveBtn.addEventListener('click', handleSaveNote);

    // Prevent event bubbling
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            e.preventDefault();
            e.stopPropagation();
            hideSaveDialog();
        }
    });

    // Input handlers
    const tagsInput = dialog.querySelector('.web-notes-tags-input');
    const noteInput = dialog.querySelector('.web-notes-note-input');

    tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            handleSaveNote();
        }
    });

    noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSaveNote();
        }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dialog.style.display === 'flex') {
            hideSaveDialog();
        }
    });

    return dialog;
}

function showSaveDialog() {
    if (!saveDialog) {
        saveDialog = createSaveDialog();
        document.body.appendChild(saveDialog);
    }

    if (!currentSelection) {
        showNotification('请先选择要保存的文本', 'info');
        return;
    }

    // Fill selected text
    const selectedTextDiv = saveDialog.querySelector('.web-notes-selected-text');
    selectedTextDiv.textContent = truncateText(currentSelection.text, 200);

    // Load existing tags
    loadExistingTagsForDialog();

    // Clear inputs
    saveDialog.querySelector('.web-notes-tags-input').value = '';
    saveDialog.querySelector('.web-notes-note-input').value = '';

    // Show dialog
    saveDialog.style.display = 'flex';

    // Focus on tags input
    setTimeout(() => {
        saveDialog.querySelector('.web-notes-tags-input').focus();
    }, 100);
}

function hideSaveDialog() {
    if (saveDialog) {
        saveDialog.style.display = 'none';
    }
}

async function loadExistingTagsForDialog() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'get-all-tags' });

        if (response && response.tags && response.tags.length > 0) {
            const tagsContainer = saveDialog.querySelector('.web-notes-existing-tags');
            tagsContainer.innerHTML = '<div class="web-notes-tags-label">已有标签：</div>';

            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'web-notes-tags-list';

            response.tags.slice(0, 10).forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'web-notes-tag-chip';
                tagSpan.textContent = tag;
                tagSpan.style.backgroundColor = getTagColor(tag);

                // Click tag to add to input
                tagSpan.addEventListener('click', () => {
                    const input = saveDialog.querySelector('.web-notes-tags-input');
                    const currentTags = input.value.trim();
                    if (currentTags) {
                        input.value = currentTags + ' ' + tag;
                    } else {
                        input.value = tag;
                    }
                    input.focus();
                });

                tagsDiv.appendChild(tagSpan);
            });

            tagsContainer.appendChild(tagsDiv);
        }
    } catch (error) {
        console.error('Failed to load existing tags:', error);
    }
}

async function handleSaveNote() {
    if (!currentSelection) {
        showNotification('没有选中的文本', 'error');
        return;
    }

    const tagsInput = saveDialog.querySelector('.web-notes-tags-input').value;
    const noteInput = saveDialog.querySelector('.web-notes-note-input').value;

    // Build note data
    const noteData = {
        id: generateId(),
        text: currentSelection.text,
        tags: parseTags(tagsInput),
        note: noteInput.trim(),
        timestamp: new Date().toISOString()
    };

    // Get page info - use the current tab's URL, not the sidebar URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageInfo = {
        title: tab?.title || document.getElementById('aiPageTitle')?.textContent || '未知页面',
        url: currentUrl || tab?.url || window.location.href
    };

    // Send to background to save
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'save-note',
            pageInfo: pageInfo,
            noteData: noteData
        });

        if (response && response.success) {
            if (response.warning === 'fs_failed') {
                showNotification('已保存到缓存，但未同步到文件', 'warning');
            } else {
                showNotification('笔记保存成功！', 'success');
            }
            hideSaveDialog();
            currentSelection = null;

            // Reload notes to show the new one
            await loadNotes();
        } else {
            showNotification('保存失败：' + (response.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Failed to save note:', error);
        showNotification('保存失败: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 9999999;
        max-width: 300px;
        animation: fadeIn 0.25s ease;
    `;

    // Set background color based on type
    if (type === 'success') {
        notification.style.background = '#48bb78';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.background = '#f56565';
        notification.style.color = 'white';
    } else if (type === 'warning') {
        notification.style.background = '#ed8936';
        notification.style.color = 'white';
    } else {
        notification.style.background = '#667eea';
        notification.style.color = 'white';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.25s ease';
        setTimeout(() => notification.remove(), 250);
    }, 3000);

    return notification;
}

