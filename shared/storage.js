// ========================================
// 本地文件存储管理
// 使用 File System Access API
// ========================================

class StorageManager {
    constructor() {
        this.directoryHandle = null;
        this.STORAGE_KEY = 'web-notes-directory-handle';
    }

    // ========================================
    // 文件夹访问
    // ========================================

    /**
     * 请求文件夹访问权限
     * @returns {Promise<boolean>} 是否成功获取权限
     */
    async requestFolderAccess() {
        try {
            // 保存旧的文件夹句柄（用于迁移）
            const oldDirectoryHandle = this.directoryHandle;

            // 请求用户选择文件夹
            const newDirectoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            // 如果有旧文件夹，询问是否迁移
            if (oldDirectoryHandle) {
                const shouldMigrate = confirm('检测到已有笔记数据。是否将现有笔记迁移到新文件夹？\n\n点击"确定"迁移，点击"取消"仅切换文件夹（旧笔记将保留在原文件夹）。');

                if (shouldMigrate) {
                    // 执行迁移
                    await this.migrateNotes(oldDirectoryHandle, newDirectoryHandle);
                }
            }

            // 更新为新文件夹
            this.directoryHandle = newDirectoryHandle;

            // 保存句柄（注意：IndexedDB持久化）
            await this.saveDirectoryHandle();

            console.log('Folder access granted:', this.directoryHandle.name);
            return true;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('User cancelled folder selection');
            } else {
                console.error('Failed to request folder access:', error);
            }
            return false;
        }
    }

    /**
     * 恢复之前保存的文件夹句柄
     * @returns {Promise<boolean>} 是否成功恢复
     */
    async restoreDirectoryHandle() {
        try {
            const db = await this.openDB();
            const handle = await this.getFromDB(db, this.STORAGE_KEY);

            if (!handle) {
                console.log('No saved directory handle found');
                return false;
            }

            // 验证权限
            let permission;
            try {
                permission = await handle.queryPermission({ mode: 'readwrite' });
            } catch (e) {
                console.warn('Failed to query permission, handle may be invalid:', e);
                return false;
            }

            if (permission === 'granted') {
                this.directoryHandle = handle;
                console.log('Directory handle restored with granted permission');
                return true;
            } else if (permission === 'prompt') {
                // 自动请求权限 - 这会弹出浏览器的权限确认对话框
                // 但这是必要的，因为用户之前已经选择过文件夹
                try {
                    const newPermission = await handle.requestPermission({ mode: 'readwrite' });
                    if (newPermission === 'granted') {
                        this.directoryHandle = handle;
                        console.log('Directory handle restored after re-requesting permission');
                        return true;
                    } else {
                        console.log('Permission request denied by user');
                        return false;
                    }
                } catch (e) {
                    console.warn('Failed to request permission:', e);
                    return false;
                }
            } else {
                console.log('Permission denied');
                return false;
            }
        } catch (error) {
            console.error('Failed to restore directory handle:', error);
            return false;
        }
    }

    /**
     * 确保有文件夹访问权限
     * @param {boolean} interactive - 是否允许交互（弹出选择框）
     * @returns {Promise<boolean>}
     */
    async ensureFolderAccess(interactive = true) {
        // 1. Check existing handle validity if present
        if (this.directoryHandle) {
            try {
                const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    return true;
                }
            } catch (e) {
                console.warn('Existing handle permission check failed:', e);
            }
            // If check failed or not granted, invalidate it
            this.directoryHandle = null;
        }

        // 2. Try to restore from IndexedDB
        // This is crucial for Service Worker which start fresh.
        const restored = await this.restoreDirectoryHandle();
        if (restored) {
            return true;
        }

        // 3. Last Manual Resort
        if (!interactive) {
            return false;
        }

        // 请求新的访问权限
        return await this.requestFolderAccess();
    }

    // ========================================
    // 笔记操作
    // ========================================

    /**
     * 保存笔记 (双写策略：缓存 + 文件系统)
     * @param {Object} pageInfo - 页面信息 {title, url}
     * @param {Object} noteData - 笔记数据 {id, text, tags, note, timestamp}
     * @returns {Promise<Object>} 保存结果
     */
    async saveNote(pageInfo, noteData) {
        let cacheResult = { success: false };
        let fsResult = { success: false };

        try {
            // 1. 写入缓存 (Hot Layer)
            await this.saveNoteToCache(pageInfo, noteData);
            cacheResult = { success: true };
            console.log('Saved to cache');

            // 2. 尝试写入文件系统 (Cold Layer)
            // 注意：Service Worker 环境下无法直接调用 showDirectoryPicker 或 handle.requestPermission
            // 但如果之前已经获得过持久化权限，某些环境下（如 Chrome 122+）可能支持后台写入
            if (typeof window !== 'undefined') {
                // 浏览器窗口环境：可以提示用户授权
                const hasAccess = await this.ensureFolderAccess(false);
                if (hasAccess) {
                    await this.saveNoteToFile(pageInfo, noteData);
                    fsResult = { success: true };
                } else {
                    fsResult = { success: false, error: 'No folder access permission', requiresAuth: true };
                }
            } else {
                // Service Worker 环境：尝试恢复句柄并静默写入
                const restored = await this.restoreDirectoryHandle();
                if (restored) {
                    try {
                        await this.saveNoteToFile(pageInfo, noteData);
                        fsResult = { success: true };
                    } catch (e) {
                        fsResult = { success: false, error: 'Service Worker FS write failed: ' + e.message, pending: true };
                    }
                } else {
                    // 如果无法恢复句柄，标记为等待同步，不要报“错误”，而是报“待同步”
                    fsResult = { success: false, error: 'FS handle not available in SW', pending: true };
                }
            }

            return {
                success: true,
                cache: cacheResult,
                fs: fsResult
            };

        } catch (error) {
            console.error('Failed to save note:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 仅写入缓存
     */
    async saveNoteToCache(pageInfo, noteData) {
        const key = `cache_${this.normalizeUrl(pageInfo.url)}`;
        const result = await chrome.storage.local.get(key);
        let data = result[key];

        if (!data) {
            data = {
                pageTitle: pageInfo.title,
                url: pageInfo.url,
                createdAt: new Date().toISOString(),
                notes: []
            };
        }

        // 避免重复添加 (根据ID)
        const exists = data.notes.some(n => n.id === noteData.id);
        if (!exists) {
            data.notes.unshift(noteData);
            await chrome.storage.local.set({ [key]: data });
        }
    }

    /**
     * 从缓存获取笔记
     */
    async getNotesFromCache(url) {
        const key = `cache_${this.normalizeUrl(url)}`;
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    }

    /**
     * 写入文件系统 (内部方法)
     */
    async saveNoteToFile(pageInfo, noteData) {
        // 生成文件名
        const fileName = this.getFileName(pageInfo.url);

        // 读取或创建文件
        let fileData = await this.readFile(fileName);

        if (!fileData) {
            // 新建文件
            fileData = {
                pageTitle: pageInfo.title,
                url: pageInfo.url,
                createdAt: new Date().toISOString(),
                notes: []
            };
        }

        // 添加笔记 (去重)
        const exists = fileData.notes.some(n => n.id === noteData.id);
        if (!exists) {
            fileData.notes.unshift(noteData); // 新笔记在前
            // 写入文件
            await this.writeFile(fileName, fileData);
        }
    }

    /**
     * 加载指定URL的笔记
     * @param {string} url - 网页URL
     * @returns {Promise<Object|null>} 笔记数据
     */
    async loadNotes(url) {
        try {
            const hasAccess = await this.ensureFolderAccess();
            if (!hasAccess) {
                return null;
            }

            const fileName = this.getFileName(url);
            return await this.readFile(fileName);
        } catch (error) {
            console.error('Failed to load notes:', error);
            return null;
        }
    }

    async loadAllNotes(interactive = true) {
        try {
            const allNotes = [];

            // 1. Try File System (Authority)
            // The user wants "reload from local", so if we have access, we ONLY read from FS.
            try {
                const hasAccess = await this.ensureFolderAccess(interactive);

                if (hasAccess) {
                    console.log('Loading from File System (Source of Truth)...');

                    // Flush cache to FS to rescue any notes stranded by partial save failures
                    await this.syncCacheToFileSystem();

                    // If we have access, the file system is the absolute truth.
                    // We ignore the cache to prevent "resurrecting" deleted notes.
                    for await (const entry of this.directoryHandle.values()) {
                        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                            try {
                                const fileData = await this.readFile(entry.name);
                                if (fileData && fileData.url) {
                                    allNotes.push(fileData);

                                    // Optional: Background sync - update cache to match file? 
                                    // For now, let's keep it simple. We just don't READ from cache if FS works.
                                }
                            } catch (err) {
                                console.warn(`Failed to read file ${entry.name}:`, err);
                            }
                        }
                    }

                    // If we successfully read from FS, return immediately.
                    // We do NOT merge with cache, because cache might contain deleted items.
                    return allNotes;
                }
            } catch (e) {
                console.warn('FS Access check failed:', e);
            }

            // 2. Fallback to Cache (Only if FS failed or no permission)
            console.log('FS inaccessible, falling back to Cache...');
            const cacheData = await chrome.storage.local.get(null);
            for (const [key, value] of Object.entries(cacheData)) {
                if (key.startsWith('cache_') && value && value.url) {
                    allNotes.push(value);
                }
            }

            return allNotes;

        } catch (error) {
            console.error('Failed to load all notes:', error);
            return [];
        }
    }

    /**
     * 更新笔记
     * @param {string} url - 网页URL
     * @param {string} noteId - 笔记ID
     * @param {Object} updates - 更新内容
     * @returns {Promise<Object>} 更新结果
     */
    async updateNote(url, noteId, updates) {
        try {
            const fileName = this.getFileName(url);
            const fileData = await this.readFile(fileName);

            if (!fileData) {
                throw new Error('File not found');
            }

            const noteIndex = fileData.notes.findIndex(n => n.id === noteId);
            if (noteIndex === -1) {
                throw new Error('Note not found');
            }

            // 更新笔记
            fileData.notes[noteIndex] = {
                ...fileData.notes[noteIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };

            await this.writeFile(fileName, fileData);

            return { success: true };
        } catch (error) {
            console.error('Failed to update note:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 更新页面标题
     * @param {string} url - 网页URL
     * @param {string} newTitle - 新标题
     * @returns {Promise<Object>} 更新结果
     */
    async updatePageTitle(url, newTitle) {
        try {
            // 1. 更新文件系统
            const fileName = this.getFileName(url);
            const fileData = await this.readFile(fileName);

            if (fileData) {
                fileData.pageTitle = newTitle;
                fileData.customTitle = newTitle; // 保存自定义标题
                fileData.updatedAt = new Date().toISOString();
                await this.writeFile(fileName, fileData);
            }

            // 2. 更新缓存
            try {
                const cacheKey = `cache_${this.normalizeUrl(url)}`;
                const cacheResult = await chrome.storage.local.get(cacheKey);
                let cacheData = cacheResult[cacheKey];

                if (cacheData) {
                    cacheData.pageTitle = newTitle;
                    cacheData.customTitle = newTitle;
                    cacheData.updatedAt = new Date().toISOString();
                    await chrome.storage.local.set({ [cacheKey]: cacheData });
                }
            } catch (e) {
                console.warn('Failed to update cache title:', e);
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to update page title:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 删除笔记
     * @param {string} url - 网页URL
     * @param {string} noteId - 笔记ID
     * @returns {Promise<Object>} 删除结果
     */
    async deleteNote(url, noteId) {
        try {
            // 1. Delete from Cache (Hot Layer)
            try {
                const cacheKey = `cache_${this.normalizeUrl(url)}`;
                const cacheResult = await chrome.storage.local.get(cacheKey);
                let cacheData = cacheResult[cacheKey];

                if (cacheData && cacheData.notes) {
                    cacheData.notes = cacheData.notes.filter(n => n.id !== noteId);
                    if (cacheData.notes.length === 0) {
                        await chrome.storage.local.remove(cacheKey);
                    } else {
                        await chrome.storage.local.set({ [cacheKey]: cacheData });
                    }
                }
            } catch (e) {
                console.warn('Failed to delete from cache:', e);
            }

            // 2. Delete from File System (Cold Layer)
            // Check if we are in environment that supports FS (window)
            if (typeof window !== 'undefined') {
                try {
                    // Try to get FS access silently first
                    const hasAccess = await this.ensureFolderAccess(false);
                    if (hasAccess) {
                        const fileName = this.getFileName(url);
                        const fileData = await this.readFile(fileName);

                        if (fileData) {
                            // 删除笔记
                            fileData.notes = fileData.notes.filter(n => n.id !== noteId);

                            // 如果没有笔记了，删除文件
                            if (fileData.notes.length === 0) {
                                await this.deleteFile(fileName);
                            } else {
                                await this.writeFile(fileName, fileData);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to delete from FS (permission or IO):', e);
                    // We don't block return on FS failure if cache succeeded, 
                    // but ideally we want both.
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to delete note:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取所有标签
     * @returns {Promise<string[]>} 标签数组（按使用频率排序）
     */
    async getAllTags() {
        try {
            const allNotes = await this.loadAllNotes();
            const tagCount = {};

            allNotes.forEach(page => {
                page.notes.forEach(note => {
                    if (note.tags && Array.isArray(note.tags)) {
                        note.tags.forEach(tag => {
                            tagCount[tag] = (tagCount[tag] || 0) + 1;
                        });
                    }
                });
            });

            // 按使用频率排序
            return Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]);
        } catch (error) {
            console.error('Failed to get all tags:', error);
            return [];
        }
    }

    // ========================================
    // 文件操作
    // ========================================

    /**
     * 读取文件
     * @param {string} fileName - 文件名
     * @returns {Promise<Object|null>} 文件内容
     */
    async readFile(fileName) {
        try {
            const fileHandle = await this.directoryHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                return null;
            }
            throw error;
        }
    }

    /**
     * 写入文件
     * @param {string} fileName - 文件名
     * @param {Object} data - 数据对象
     */
    async writeFile(fileName, data) {
        const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    }

    /**
     * 删除文件
     * @param {string} fileName - 文件名
     */
    async deleteFile(fileName) {
        await this.directoryHandle.removeEntry(fileName);
    }

    // ========================================
    // Page Markdown Operations
    // ========================================

    /**
     * Save page markdown content
     * @param {string} url - Page URL
     * @param {string} markdown - Markdown content
     * @param {Object} metadata - Optional metadata
     * @returns {Promise<Object>} Save result
     */
    async savePageMarkdown(url, markdown, metadata = {}) {
        try {
            const hasAccess = await this.ensureFolderAccess(false);
            if (!hasAccess) {
                return { success: false, error: 'No folder access permission' };
            }

            const fileName = this.getMarkdownFileName(url);
            const data = {
                url,
                markdown,
                metadata,
                savedAt: new Date().toISOString()
            };

            // Write markdown as plain text file
            const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();

            // Write metadata as frontmatter + markdown content
            const content = markdown; // Markdown already includes metadata header from extractor
            await writable.write(content);
            await writable.close();

            console.log(`Saved page markdown: ${fileName}`);
            return { success: true };
        } catch (error) {
            console.error('Failed to save page markdown:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load page markdown content
     * @param {string} url - Page URL
     * @returns {Promise<string|null>} Markdown content or null
     */
    async loadPageMarkdown(url) {
        try {
            const hasAccess = await this.ensureFolderAccess(false);
            if (!hasAccess) {
                return null;
            }

            const fileName = this.getMarkdownFileName(url);
            const fileHandle = await this.directoryHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const markdown = await file.text();

            return markdown;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                return null; // File doesn't exist yet
            }
            console.error('Failed to load page markdown:', error);
            return null;
        }
    }

    /**
     * Generate markdown filename for a URL
     * @param {string} url - Page URL
     * @returns {string} Markdown filename
     */
    getMarkdownFileName(url) {
        const normalizedUrl = this.normalizeUrl(url);
        const hash = hashUrl(normalizedUrl);
        return `page_${hash}.md`;
    }

    /**
     * 迁移笔记从旧文件夹到新文件夹
     * @param {FileSystemDirectoryHandle} oldHandle - 旧文件夹句柄
     * @param {FileSystemDirectoryHandle} newHandle - 新文件夹句柄
     */
    async migrateNotes(oldHandle, newHandle) {
        try {
            console.log('Starting migration...');
            let migratedCount = 0;

            // 遍历旧文件夹中的所有JSON文件
            for await (const entry of oldHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    try {
                        // 读取旧文件
                        const fileHandle = await oldHandle.getFileHandle(entry.name);
                        const file = await fileHandle.getFile();
                        const content = await file.text();

                        // 写入新文件夹
                        const newFileHandle = await newHandle.getFileHandle(entry.name, { create: true });
                        const writable = await newFileHandle.createWritable();
                        await writable.write(content);
                        await writable.close();

                        migratedCount++;
                        console.log(`Migrated: ${entry.name}`);
                    } catch (error) {
                        console.error(`Failed to migrate ${entry.name}:`, error);
                    }
                }
            }

            console.log(`Migration complete! Migrated ${migratedCount} files.`);
            alert(`成功迁移 ${migratedCount} 个笔记文件到新文件夹！`);
        } catch (error) {
            console.error('Migration failed:', error);
            alert('迁移过程中出现错误，部分笔记可能未成功迁移。');
        }
    }

    /**
     * 生成文件名
     * @param {string} url - 网页URL
     * @returns {string} 文件名
     */
    getFileName(url) {
        // 归一化URL
        const normalizedUrl = this.normalizeUrl(url);
        // 使用URL的hash作为文件名
        const hash = hashUrl(normalizedUrl);
        return `note_${hash}.json`;
    }

    /**
     * 归一化URL（去除hash、query、末尾斜杠，并解码）
     * @param {string} url 
     * @returns {string}
     */
    normalizeUrl(url) {
        if (!url) return '';
        try {
            // 1. 解码URL (处理中文字符不一致的问题)
            let normalized = decodeURIComponent(url);

            // 2. 去除hash
            normalized = normalized.split('#')[0];

            // 3. 去除末尾斜杠
            normalized = normalized.replace(/\/+$/, '');

            return normalized;
        } catch (e) {
            console.error('URL normalization failed:', e);
            return url;
        }
    }

    // ========================================
    // IndexedDB 操作（用于持久化文件夹句柄）
    // ========================================

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('WebNotesDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
            };
        });
    }

    async saveDirectoryHandle() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['handles'], 'readwrite');
            const store = transaction.objectStore('handles');
            const request = store.put(this.directoryHandle, this.STORAGE_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getFromDB(db, key) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['handles'], 'readonly');
            const store = transaction.objectStore('handles');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    async syncCacheToFileSystem() {
        try {
            console.log('Syncing Cache to File System...');
            const cacheData = await chrome.storage.local.get(null);

            for (const [key, value] of Object.entries(cacheData)) {
                if (key.startsWith('cache_') && value && value.url) {
                    const fileName = this.getFileName(value.url);
                    let existingFile = null;

                    try {
                        // Check if file exists
                        const fileHandle = await this.directoryHandle.getFileHandle(fileName).catch(() => null);
                        if (fileHandle) {
                            const file = await fileHandle.getFile();
                            const text = await file.text();
                            existingFile = JSON.parse(text);
                        }
                    } catch (readErr) { /* ignore */ }

                    if (existingFile) {
                        // Merge: Add cached notes that are NOT in the file
                        const fileIds = new Set(existingFile.notes.map(n => n.id));
                        const newNotes = value.notes.filter(n => !fileIds.has(n.id));

                        if (newNotes.length > 0) {
                            const mergedData = { ...existingFile };
                            mergedData.notes = [...newNotes, ...existingFile.notes];
                            await this.writeFile(fileName, mergedData);
                            console.log(`Synced ${newNotes.length} notes to ${fileName}`);
                        }
                    } else {
                        // File missing? Write the whole cache page
                        await this.writeFile(fileName, value);
                        console.log(`Restored missing file ${fileName} from cache`);
                    }
                }
            }
        } catch (e) {
            console.error('Sync failed:', e);
        }
    }
}

// 导出单例
const storageManager = new StorageManager();
