// ========================================
// Background Service Worker
// 处理消息、快捷键和文件操作
// ========================================

// 导入storage manager（注意：Service Worker中需要使用importScripts）
importScripts('chrome-extension://' + chrome.runtime.id + '/shared/utils.js');
importScripts('chrome-extension://' + chrome.runtime.id + '/shared/storage.js');

console.log('Web Notes Extension: Service worker loaded');

// Side panel behavior removed

// ========================================
// 右键菜单
// ========================================

chrome.runtime.onInstalled.addListener(() => {
    // 创建右键菜单
    chrome.contextMenus.create({
        id: 'save-note',
        title: '💾 保存为笔记',
        contexts: ['selection']
    });
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save-note' && info.selectionText) {
        const message = {
            action: 'save-note-from-context',
            selectedText: info.selectionText
        };

        // Check if this is from sidebar (tab.id will be -1)
        if (!tab || tab.id === -1 || tab.id < 0) {
            // This is from sidebar or extension page, send message to runtime
            try {
                // Send runtime message to sidebar
                chrome.runtime.sendMessage(message).catch(e => {
                    console.log('Runtime message failed (expected if no listeners):', e);
                });
            } catch (error) {
                console.error('Failed to send message to sidebar:', error);
            }
            return;
        }

        try {
            // 尝试发送消息到普通网页tab
            await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
            console.log('Content script not ready, injecting scripts...', error);

            try {
                // 动态注入脚本和样式
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['content/content.css']
                });

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['shared/utils.js', 'content/content.js']
                });

                // 给一点时间让脚本初始化
                setTimeout(async () => {
                    try {
                        // 重试发送消息
                        await chrome.tabs.sendMessage(tab.id, message);
                    } catch (retryError) {
                        console.error('Retry failed:', retryError);
                        // 如果还是失败，才弹窗提示
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                alert('自动启动失败。请手动刷新当前页面后再试。');
                            }
                        });
                    }
                }, 100);
            } catch (injectError) {
                console.error('Script injection failed:', injectError);
                // 这种情况下通常是无法注入（如chrome://页面）
                // 尝试用简单alert提示
                try {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            alert('无法在当前页面使用笔记功能（可能是受浏览器安全限制）。');
                        }
                    });
                } catch (e) { /* ignore */ }
            }
        }
    }
});

// ========================================
// 消息处理
// ========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message.action);

    // 异步处理
    handleMessage(message, sender, sendResponse);

    // 返回true表示异步响应
    return true;
});

async function handleMessage(message, sender, sendResponse) {
    try {
        switch (message.action) {
            case 'save-note':
                await handleSaveNote(message, sendResponse, sender);
                break;

            case 'load-notes':
                await handleLoadNotes(message, sendResponse);
                break;

            case 'load-all-notes':
                await handleLoadAllNotes(sendResponse);
                break;

            case 'update-note':
                await handleUpdateNote(message, sendResponse);
                break;

            case 'delete-note':
                await handleDeleteNote(message, sendResponse);
                break;

            case 'get-all-tags':
                await handleGetAllTags(sendResponse);
                break;

            case 'request-folder-access':
                await handleRequestFolderAccess(sendResponse);
                break;

            case 'open-all-notes':
                chrome.tabs.create({ url: 'pages/all-notes.html' });
                sendResponse({ success: true });
                return; // Return immediately

            case 'save-page-markdown':
                await handleSavePageMarkdown(message, sendResponse);
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// ========================================
// 消息处理函数
// ========================================

// Sidebar connection logic removed

async function handleSaveNote(message, sendResponse, sender) {
    const { pageInfo, noteData } = message;

    try {
        // 1. 尝试保存 (双写策略：缓存 + FS)
        const saveResult = await storageManager.saveNote(pageInfo, noteData);

        if (saveResult.success) {
            console.log('SW: Note saved successfully');

            // 检查 FS 保存状态
            if (saveResult.fs && !saveResult.fs.success) {
                // 只有在明确需要用户交互授权，且不是挂起状态时，才显示警告
                if (saveResult.fs.requiresAuth && !saveResult.fs.pending) {
                    sendResponse({
                        success: true,
                        warning: 'fs_failed',
                        warningMsg: '未授权访问文件夹，笔记仅存入缓存'
                    });
                } else {
                    // 其他情况（如在 SW 中待同步）视为成功，不干扰用户
                    sendResponse({ success: true });
                }
            } else {
                sendResponse({ success: true });
            }
        } else {
            sendResponse({ success: false, error: saveResult.error });
        }
    } catch (error) {
        console.error('SW: Save failed', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleLoadNotes(message, sendResponse) {
    const { url } = message;

    try {
        const notes = await storageManager.loadNotes(url);
        sendResponse({ success: true, notes });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleLoadAllNotes(sendResponse) {
    try {
        const allNotes = await storageManager.loadAllNotes();
        sendResponse({ success: true, notes: allNotes });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleUpdateNote(message, sendResponse) {
    const { url, noteId, updates } = message;

    try {
        const result = await storageManager.updateNote(url, noteId, updates);
        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleDeleteNote(message, sendResponse) {
    const { url, noteId } = message;

    try {
        const result = await storageManager.deleteNote(url, noteId);
        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetAllTags(sendResponse) {
    try {
        const tags = await storageManager.getAllTags();
        sendResponse({ success: true, tags });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleRequestFolderAccess(sendResponse) {
    try {
        const success = await storageManager.requestFolderAccess();
        sendResponse({ success });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleSavePageMarkdown(message, sendResponse) {
    const { url, markdown, metadata } = message;

    try {
        const result = await storageManager.savePageMarkdown(url, markdown, metadata);
        sendResponse(result);
    } catch (error) {
        console.error('Failed to save page markdown:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// ========================================
// 安装和更新
// ========================================

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
        // 首次安装，打开欢迎引导页面
        chrome.tabs.create({
            url: 'pages/onboarding.html'
        });
    }
});
