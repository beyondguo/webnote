// ========================================
// Settings Page Script
// Manages AI configuration storage and validation
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Load existing config
    await loadConfig();

    // Event listeners
    document.getElementById('backBtn').addEventListener('click', () => {
        window.close();
    });

    document.getElementById('toggleApiKey').addEventListener('click', toggleApiKeyVisibility);

    document.getElementById('aiConfigForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfig();
    });

    document.getElementById('testBtn').addEventListener('click', testConnection);
});

/**
 * Load saved AI configuration
 */
async function loadConfig() {
    try {
        const result = await chrome.storage.local.get('ai_config');
        const config = result.ai_config || {};

        document.getElementById('apiKey').value = config.apiKey || '';
        document.getElementById('baseUrl').value = config.baseUrl || 'https://api.openai.com/v1';
        document.getElementById('model').value = config.model || 'gpt-4o-mini';
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

/**
 * Save AI configuration
 */
async function saveConfig() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim() || 'https://api.openai.com/v1';
    const model = document.getElementById('model').value.trim() || 'gpt-4o-mini';

    if (!apiKey) {
        showStatus('请输入 API Key', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="loading-spinner"></span> 保存中...';
    saveBtn.disabled = true;

    try {
        await chrome.storage.local.set({
            ai_config: {
                apiKey,
                baseUrl,
                model
            }
        });

        showStatus('✅ 配置已保存', 'success');
    } catch (error) {
        console.error('Failed to save config:', error);
        showStatus('保存失败: ' + error.message, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

/**
 * Test API connection
 */
async function testConnection() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim() || 'https://api.openai.com/v1';
    const model = document.getElementById('model').value.trim() || 'gpt-4o-mini';

    if (!apiKey) {
        showStatus('请先输入 API Key', 'error');
        return;
    }

    const testBtn = document.getElementById('testBtn');
    const originalText = testBtn.innerHTML;
    testBtn.innerHTML = '<span class="loading-spinner"></span> 测试中...';
    testBtn.disabled = true;

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: 'Hi' }
                ],
                max_tokens: 5
            })
        });

        if (response.ok) {
            showStatus('✅ 连接成功！API 配置有效', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
            showStatus(`❌ 连接失败: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Connection test failed:', error);
        showStatus(`❌ 连接失败: ${error.message}`, 'error');
    } finally {
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
    }
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKey');
    const btn = document.getElementById('toggleApiKey');

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
        `;
    } else {
        input.type = 'password';
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        `;
    }
}

/**
 * Show status message
 */
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message show ${type}`;

    // Auto hide after 5 seconds
    setTimeout(() => {
        statusEl.classList.remove('show');
    }, 5000);
}
