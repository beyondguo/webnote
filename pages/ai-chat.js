// ========================================
// AI Chat Page Script
// Handles chat interface and AI interactions
// ========================================

// State
let chatHistory = [];
let pageContent = '';
let pageMetadata = {};
let isProcessing = false;
let currentTabId = null;

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

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Get tabId from URL
    const urlParams = new URLSearchParams(window.location.search);
    currentTabId = parseInt(urlParams.get('tabId'));

    // Setup event listeners
    setupEventListeners();

    // Check AI configuration
    const isConfigured = await AIService.isAIConfigured();
    if (!isConfigured) {
        showErrorModal('请先配置 API Key 才能使用 AI 功能。');
        return;
    }

    // Initialize chat
    await initializeChat();
});

function setupEventListeners() {
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        window.close();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    });

    // Send button
    document.getElementById('sendBtn').addEventListener('click', sendMessage);

    // Input handling
    const input = document.getElementById('messageInput');
    input.addEventListener('input', () => {
        // Auto-resize textarea
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';

        // Enable/disable send button
        document.getElementById('sendBtn').disabled = !input.value.trim() || isProcessing;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.value.trim() && !isProcessing) {
                sendMessage();
            }
        }
    });

    // Content preview toggle
    document.getElementById('contentPreviewToggle').addEventListener('click', () => {
        const toggle = document.getElementById('contentPreviewToggle');
        const body = document.getElementById('contentPreviewBody');

        toggle.classList.toggle('expanded');
        body.classList.toggle('expanded');
    });

    // Modal buttons
    document.getElementById('goToSettings').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        hideErrorModal();
        window.close();
    });
}

async function initializeChat() {
    try {
        // Get page info from URL parameter
        if (!currentTabId) {
            throw new Error('无法获取页面信息');
        }

        // Get tab info
        const tab = await chrome.tabs.get(currentTabId);
        const pageUrl = tab.url;
        const pageTitle = tab.title || '未知页面';

        document.getElementById('pageTitle').textContent = pageTitle;
        document.getElementById('pageUrl').textContent = pageUrl;

        // Extract page content using the robust helper function
        showLoading('正在提取页面内容...');

        const response = await extractMarkdownFromUrl(pageUrl, (progress) => {
            showLoading(progress);
        });

        if (response && response.success) {
            pageContent = response.markdown;
            pageMetadata = response.metadata || {};

            // Show content preview section
            const previewSection = document.getElementById('contentPreviewSection');
            previewSection.style.display = 'block';

            // Update content length
            const contentLength = pageContent.length;
            document.getElementById('contentLength').textContent = `(${(contentLength / 1024).toFixed(1)} KB)`;

            // Set preview text
            document.getElementById('contentPreviewText').textContent = pageContent;

            console.log('Page content extracted successfully:', contentLength, 'characters');
        } else {
            console.error('Failed to extract content:', response?.error);

            // Use fallback content
            pageContent = `页面标题: ${pageTitle}\n页面地址: ${pageUrl}\n\n[无法提取页面详细内容]\n\n可能原因：\n- 页面需要登录或有访问限制\n- 页面使用了特殊的内容保护\n- 网络连接问题\n\n错误信息: ${response?.error || '未知错误'}`;

            // Still show preview section with fallback content
            const previewSection = document.getElementById('contentPreviewSection');
            previewSection.style.display = 'block';
            document.getElementById('contentLength').textContent = '(提取失败)';
            document.getElementById('contentPreviewText').textContent = pageContent;
        }

        hideLoading();

        // Initialize conversation with page content summary
        await startConversation();

    } catch (error) {
        console.error('Failed to initialize chat:', error);
        hideLoading();
        showErrorModal('初始化失败: ' + error.message);
    }
}

async function startConversation() {
    // Show loading message
    showLoading('AI 正在阅读页面内容...');

    // Build initial messages
    chatHistory = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content: `请仔细阅读以下网页内容，然后用简洁的语言总结主要内容（100-200字），最后问我"有什么我们可以讨论的？"

网页内容：
${pageContent}`
        }
    ];

    hideLoading();

    // Show typing indicator
    showTypingIndicator();

    try {
        // Get AI response with streaming
        let aiResponse = '';
        const messageEl = createAIMessage();

        await AIService.chatWithAIStream(chatHistory, (chunk) => {
            aiResponse += chunk;
            updateMessageContent(messageEl, aiResponse);
            scrollToBottom();
        });

        // Add to chat history
        chatHistory.push({ role: 'assistant', content: aiResponse });

        // Enable input
        document.getElementById('messageInput').focus();

    } catch (error) {
        console.error('AI response failed:', error);
        hideTypingIndicator();
        addMessage('ai', '抱歉，AI 响应失败：' + error.message);
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message || isProcessing) return;

    isProcessing = true;
    document.getElementById('sendBtn').disabled = true;

    // Add user message
    addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // Add to history
    chatHistory.push({ role: 'user', content: message });

    // Show typing indicator
    showTypingIndicator();

    try {
        // Get AI response with streaming
        let aiResponse = '';
        const messageEl = createAIMessage();

        await AIService.chatWithAIStream(chatHistory, (chunk) => {
            aiResponse += chunk;
            updateMessageContent(messageEl, aiResponse);
            scrollToBottom();
        });

        // Add to chat history
        chatHistory.push({ role: 'assistant', content: aiResponse });

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
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

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
    element.textContent = content;
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

    // Remove existing typing indicator
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
    if (indicator) {
        indicator.remove();
    }
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
