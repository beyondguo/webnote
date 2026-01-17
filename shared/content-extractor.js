// ========================================
// Content Extractor Utility
// Robust content extraction with automatic script injection fallback
// ========================================

/**
 * Extract markdown content from a tab with automatic script injection fallback
 * @param {number} tabId - The tab to extract content from
 * @returns {Promise<{success: boolean, markdown?: string, metadata?: object, error?: string}>}
 */
async function extractMarkdownFromTab(tabId) {
    try {
        // First attempt: Try sending message directly
        const response = await sendExtractMessage(tabId);
        if (response && response.success) {
            return response;
        }
        throw new Error(response?.error || 'Extraction failed');
    } catch (error) {
        console.log('Direct extraction failed, attempting script injection...', error.message);

        // Check if it's a connection error (content script not loaded)
        const isConnectionError = error.message.includes('Could not establish connection') ||
            error.message.includes('Receiving end does not exist');

        if (!isConnectionError) {
            // For other errors, just return the error
            return { success: false, error: error.message };
        }

        // Second attempt: Inject scripts and retry
        try {
            await injectContentScripts(tabId);

            // Wait for scripts to initialize
            await new Promise(resolve => setTimeout(resolve, 500));

            // Retry extraction
            const retryResponse = await sendExtractMessage(tabId);
            if (retryResponse && retryResponse.success) {
                return retryResponse;
            }
            return { success: false, error: retryResponse?.error || 'Extraction failed after injection' };
        } catch (injectionError) {
            console.error('Script injection failed:', injectionError);
            return {
                success: false,
                error: `无法在该页面提取内容: ${injectionError.message}`
            };
        }
    }
}

/**
 * Send extractMarkdown message to a tab
 * @param {number} tabId 
 * @returns {Promise<object>}
 */
async function sendExtractMessage(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'extractMarkdown' }, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Dynamically inject content scripts into a tab
 * @param {number} tabId 
 */
async function injectContentScripts(tabId) {
    // Inject CSS first
    await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content/content.css']
    });

    // Inject required libraries and scripts
    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
            'libs/readability.min.js',
            'libs/turndown.min.js',
            'shared/utils.js',
            'content/markdown-extractor.js',
            'content/content.js'
        ]
    });
}

/**
 * Helper function to extract content from a page URL
 * Opens a background tab if needed, extracts content, then closes the tab
 * @param {string} pageUrl - The URL to extract content from
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<{success: boolean, markdown?: string, metadata?: object, error?: string}>}
 */
async function extractMarkdownFromUrl(pageUrl, onProgress = () => { }) {
    let backgroundTabId = null;

    try {
        // Check if the page is already open
        const tabs = await chrome.tabs.query({});
        const existingTab = tabs.find(t =>
            storageManager.normalizeUrl(t.url) === storageManager.normalizeUrl(pageUrl)
        );

        let extractTabId;
        if (existingTab) {
            // Use existing tab
            extractTabId = existingTab.id;
            onProgress('✓ 找到已打开的标签页');
            console.log('Using existing tab:', extractTabId);
        } else {
            // Open in background tab
            onProgress('正在后台打开网页...');
            const newTab = await chrome.tabs.create({
                url: pageUrl,
                active: false // Open in background
            });
            extractTabId = newTab.id;
            backgroundTabId = newTab.id;

            // Wait for page to load
            await new Promise((resolve) => {
                const listener = (updatedTabId, changeInfo) => {
                    if (updatedTabId === extractTabId && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);

                // Timeout after 30 seconds
                setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }, 30000);
            });

            onProgress('✓ 页面加载完成');
        }

        // Wait a bit for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        onProgress('正在提取内容...');

        // Extract markdown using our robust function
        const response = await extractMarkdownFromTab(extractTabId);

        // Close the background tab if we opened it
        if (backgroundTabId && !existingTab) {
            try {
                await chrome.tabs.remove(backgroundTabId);
            } catch (e) {
                // Tab might already be closed
            }
            backgroundTabId = null;
        }

        return response;

    } catch (error) {
        console.error('Failed to extract content from URL:', error);

        // Cleanup background tab
        if (backgroundTabId) {
            try {
                await chrome.tabs.remove(backgroundTabId);
            } catch (e) {
                // Tab might already be closed
            }
        }

        return { success: false, error: error.message };
    }
}
