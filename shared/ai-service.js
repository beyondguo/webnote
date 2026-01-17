// ========================================
// AI Service Module
// Provides OpenAI-compatible API integration
// ========================================

/**
 * Load AI configuration from storage
 * @returns {Promise<Object|null>} Config object or null if not configured
 */
async function loadAIConfig() {
    try {
        const result = await chrome.storage.local.get('ai_config');
        const config = result.ai_config;

        if (!config || !config.apiKey) {
            return null;
        }

        return {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || 'https://api.openai.com/v1',
            model: config.model || 'gpt-4o-mini'
        };
    } catch (error) {
        console.error('Failed to load AI config:', error);
        return null;
    }
}

/**
 * Check if AI is configured
 * @returns {Promise<boolean>}
 */
async function isAIConfigured() {
    const config = await loadAIConfig();
    return config !== null;
}

/**
 * Send chat message to AI (non-streaming)
 * @param {Array} messages - Chat messages array
 * @param {Object} options - Optional parameters
 * @returns {Promise<string>} AI response text
 */
async function chatWithAI(messages, options = {}) {
    const config = await loadAIConfig();

    if (!config) {
        throw new Error('AI 未配置，请先前往设置页面配置 API');
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: messages,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature || 0.7
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`API 调用失败: ${errorMsg}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

/**
 * Send chat message to AI with streaming
 * @param {Array} messages - Chat messages array
 * @param {Function} onChunk - Callback for each chunk of text
 * @param {Object} options - Optional parameters
 * @returns {Promise<string>} Complete AI response text
 */
async function chatWithAIStream(messages, onChunk, options = {}) {
    const config = await loadAIConfig();

    if (!config) {
        throw new Error('AI 未配置，请先前往设置页面配置 API');
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: messages,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature || 0.7,
            stream: true
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        throw new Error(`API 调用失败: ${errorMsg}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) {
                            fullContent += content;
                            if (onChunk) onChunk(content);
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullContent;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.AIService = {
        loadAIConfig,
        isAIConfigured,
        chatWithAI,
        chatWithAIStream
    };
}
