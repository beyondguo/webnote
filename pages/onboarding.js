document.addEventListener('DOMContentLoaded', () => {
    // 设置文件夹
    const setupBtn = document.getElementById('setupFolder');
    if (setupBtn) {
        setupBtn.addEventListener('click', async () => {
            setupBtn.disabled = true;
            setupBtn.textContent = '正在打开文件夹选择器...';

            try {
                // 直接调用 storage manager
                const success = await storageManager.requestFolderAccess();

                if (success) {
                    // 设置成功，显示成功消息
                    setupBtn.textContent = '✅ 设置成功！';
                    setupBtn.style.background = '#48bb78';

                    // 2秒后关闭页面
                    setTimeout(() => {
                        window.close();
                    }, 2000);
                } else {
                    alert('文件夹设置失败或已取消');
                    setupBtn.disabled = false;
                    setupBtn.textContent = '📁 设置保存文件夹';
                }
            } catch (error) {
                console.error('Failed to setup folder:', error);
                alert('设置失败：' + error.message);
                setupBtn.disabled = false;
                setupBtn.textContent = '📁 设置保存文件夹';
            }
        });
    } else {
        console.error('Setup button not found!');
    }
});
