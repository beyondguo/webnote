// ========================================
// Content Script - 文本高亮与笔记保存
// 注入到所有网页，监听文本选择并提供保存功能
// ========================================

(function () {
    'use strict';

    // 配置
    const CONFIG = {
        toolbarId: 'web-notes-floating-toolbar',
        dialogId: 'web-notes-save-dialog',
        minSelectionLength: 3, // 最小选择文本长度
    };

    // 状态
    let floatingToolbar = null;
    let saveDialog = null;
    let currentSelection = null;

    // ========================================
    // 初始化
    // ========================================

    function init() {
        console.log('Web Notes Extension: Content script loaded');

        // 监听文本选择
        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('keyup', handleTextSelection);

        // 监听来自background的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'save-note-shortcut') {
                handleShortcutSave();
            } else if (message.action === 'save-note-from-context') {
                // 从右键菜单触发
                currentSelection = {
                    text: message.selectedText,
                    range: null
                };
                try {
                    showSaveDialog();
                } catch (e) {
                    alert('Error showing save dialog: ' + e.message);
                    console.error(e);
                }
            } else if (message.action === 'extractMarkdown') {
                // 提取页面 Markdown
                const result = extractPageMarkdown();
                sendResponse(result);
                return true; // Keep message channel open for async response
            }
        });

        // 点击其他地方隐藏工具栏
        document.addEventListener('click', (e) => {
            if (floatingToolbar && !floatingToolbar.contains(e.target)) {
                hideFloatingToolbar();
            }
        });
    }

    // ========================================
    // 文本选择处理
    // ========================================

    function handleTextSelection(e) {
        // 如果对话框已打开，直接忽略选择事件，防止覆盖待保存的文本
        if (saveDialog && saveDialog.style.display === 'flex') {
            return;
        }

        // 延迟执行，确保选择已完成
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            // 如果选择的文本足够长，显示工具栏
            if (selectedText.length >= CONFIG.minSelectionLength) {
                currentSelection = {
                    text: selectedText,
                    range: selection.getRangeAt(0)
                };
                showFloatingToolbar(e);
            } else {
                hideFloatingToolbar();
            }
        }, 10);
    }

    // ========================================
    // 浮动工具栏
    // ========================================

    function createFloatingToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = CONFIG.toolbarId;
        toolbar.className = 'web-notes-toolbar fade-in';

        toolbar.innerHTML = `
      <button class="web-notes-save-btn" title="保存笔记">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>保存笔记</span>
      </button>
    `;

        // 点击保存按钮
        toolbar.querySelector('.web-notes-save-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showSaveDialog();
        });

        return toolbar;
    }

    function showFloatingToolbar(event) {
        if (!floatingToolbar) {
            floatingToolbar = createFloatingToolbar();
            document.body.appendChild(floatingToolbar);
        }

        // 计算位置（在选择文本上方）
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            const toolbarHeight = 40;
            const toolbarWidth = 140;

            let top = rect.top + window.scrollY - toolbarHeight - 10;
            let left = rect.left + window.scrollX + (rect.width / 2) - (toolbarWidth / 2);

            // 确保不超出视口
            if (top < window.scrollY) {
                top = rect.bottom + window.scrollY + 10;
            }

            if (left < 0) {
                left = 10;
            } else if (left + toolbarWidth > window.innerWidth) {
                left = window.innerWidth - toolbarWidth - 10;
            }

            floatingToolbar.style.top = `${top}px`;
            floatingToolbar.style.left = `${left}px`;
            floatingToolbar.style.display = 'block';
        }
    }

    function hideFloatingToolbar() {
        if (floatingToolbar) {
            floatingToolbar.style.display = 'none';
        }
    }

    // ========================================
    // 保存对话框
    // ========================================

    function createSaveDialog() {
        const dialog = document.createElement('div');
        dialog.id = CONFIG.dialogId;
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
            <label for="web-notes-tags-id">标签 <span class="web-notes-hint">（用空格分隔多个标签）</span></label>
            <input type="text" id="web-notes-tags-id" name="tags" class="web-notes-tags-input" placeholder="例如: 工作 重要 学习">
            <div class="web-notes-existing-tags"></div>
          </div>
          
          <div class="web-notes-form-group">
            <label for="web-notes-note-id">备注 <span class="web-notes-hint">（可选）</span></label>
            <textarea id="web-notes-note-id" name="note" class="web-notes-note-input" placeholder="添加额外的备注..." rows="3"></textarea>
          </div>
        </div>
        
        <div class="web-notes-dialog-footer">
          <button class="web-notes-btn web-notes-btn-secondary web-notes-cancel-btn">取消</button>
          <button class="web-notes-btn web-notes-btn-primary web-notes-save-confirm-btn">保存</button>
        </div>
      </div>
    `;

        // 事件监听
        const closeBtn = dialog.querySelector('.web-notes-close-btn');
        const cancelBtn = dialog.querySelector('.web-notes-cancel-btn');
        const saveBtn = dialog.querySelector('.web-notes-save-confirm-btn');
        const overlay = dialog;
        // const overlay = dialog; // overlay is dialog itself

        closeBtn.addEventListener('click', hideSaveDialog);
        cancelBtn.addEventListener('click', hideSaveDialog);
        saveBtn.addEventListener('click', handleSaveNote);

        // EVENT FIREWALL: Prevent events from bubbling to PDF viewer
        // We block all relevant events on the dialog container to "hide" user interaction from the global document
        const firewallEvents = [
            'mousedown', 'mouseup', 'click', 'dblclick',
            'contextmenu', 'wheel',
            'keydown', 'keyup', 'keypress'
        ];

        const stopPropagation = (e) => {
            // Allow events to bubble within our dialog, but stop them from reaching the document (PDF viewer)
            e.stopPropagation();
        };

        firewallEvents.forEach(eventType => {
            dialog.addEventListener(eventType, stopPropagation);
        });

        // Overlay click handling (close dialog)
        // We need to ensure even this click doesn't propagate after we handle it
        dialog.addEventListener('click', (e) => {
            // If clicking the overlay background (not the dialog card)
            if (e.target === dialog) {
                e.preventDefault();
                e.stopPropagation();
                hideSaveDialog();
            }
        });

        // Input handlers (Standard logic)
        // Note: The firewall above already prevents these keys from reaching the PDF viewer.
        // We only need to handle our specific logic here.
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

        // ESC键关闭
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

        // 填充选中的文本
        const selectedTextDiv = saveDialog.querySelector('.web-notes-selected-text');
        selectedTextDiv.textContent = truncateText(currentSelection.text, 200);

        // 加载已有标签
        loadExistingTags();

        // 清空输入
        saveDialog.querySelector('.web-notes-tags-input').value = '';
        saveDialog.querySelector('.web-notes-note-input').value = '';

        // 显示对话框
        saveDialog.style.display = 'flex';

        // 聚焦到标签输入框
        setTimeout(() => {
            saveDialog.querySelector('.web-notes-tags-input').focus();
        }, 100);

        // 隐藏浮动工具栏
        hideFloatingToolbar();
    }

    function hideSaveDialog() {
        if (saveDialog) {
            saveDialog.style.display = 'none';
        }
    }

    async function loadExistingTags() {
        try {
            // 从storage获取已有标签
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

                    // 点击标签添加到输入框
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
            const errorMsg = error.message || String(error);
            if (errorMsg.includes('Extension context invalidated')) {
                const tagsContainer = saveDialog.querySelector('.web-notes-existing-tags');
                if (tagsContainer) {
                    tagsContainer.innerHTML = `
                        <div style="color:red;font-size:12px;display:flex;align-items:center;gap:8px;">
                            <span>⚠️ 连接已断开 (需刷新页面)</span>
                            <button id="errorRefreshBtn" style="padding:2px 8px;cursor:pointer;">刷新</button>
                        </div>
                    `;
                    document.getElementById('errorRefreshBtn').addEventListener('click', () => window.location.reload());
                }
            }
        }
    }

    async function handleSaveNote() {
        if (!currentSelection) {
            showNotification('没有选中的文本', 'error');
            return;
        }

        // 获取配置：是否开启极简模式 (默认关闭)
        const settings = await chrome.storage.local.get('minimalMode');
        const isMinimalMode = settings.minimalMode === true;

        if (isMinimalMode && saveDialog && saveDialog.style.display !== 'flex') {
            // 如果是极简模式，且对话框没打开，则直接静默保存
            await performSave('', '');
            return;
        }

        const tagsInput = saveDialog.querySelector('.web-notes-tags-input').value;
        const noteInput = saveDialog.querySelector('.web-notes-note-input').value;

        await performSave(tagsInput, noteInput);
    }

    async function performSave(tagsInput, noteInput) {
        if (!currentSelection) return;

        // 构建笔记数据
        const noteData = {
            id: generateId(),
            text: currentSelection.text,
            tags: parseTags(tagsInput),
            note: noteInput.trim(),
            timestamp: new Date().toISOString()
        };

        // 获取页面信息
        const pageInfo = {
            title: document.title,
            url: window.location.href
        };

        // 发送到background保存
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'save-note',
                pageInfo: pageInfo,
                noteData: noteData
            });

            if (response && response.success) {
                if (response.warning === 'fs_failed') {
                    const n = showNotification('已保存到缓存，但未同步到文件 (点击此处设置)', 'warning');
                    if (n) {
                        n.style.cursor = 'pointer';
                        n.onclick = () => chrome.runtime.sendMessage({ action: 'open-all-notes' });
                    }
                } else {
                    showNotification('笔记保存成功！', 'success');
                }
                hideSaveDialog();
                currentSelection = null;
            } else {
                showNotification('保存失败：' + (response.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('Failed to save note:', error);

            const errorMsg = error.message || String(error);

            // 专门处理扩展上下文失效错误
            if (errorMsg.includes('Extension context invalidated')) {
                alert('扩展程序已更新，请刷新当前网页后重试！\n\n(浏览器要求扩展更新后必须刷新页面才能重新建立连接)');
                window.location.reload(); // 尝试自动刷新
            } else {
                showNotification('保存失败: ' + errorMsg, 'error');
            }
        }
    }

    // ========================================
    // 启动
    // ========================================

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
