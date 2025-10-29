import browser from 'webextension-polyfill';

interface ExportSettings {
  withMedia: boolean;
  includeThoughts: boolean;
  includeBlocked: boolean;
}

interface ScriptResponse {
  success: boolean;
  error?: string;
}

const DEFAULT_SETTINGS: ExportSettings = {
  withMedia: true,
  includeThoughts: true,
  includeBlocked: true
};

document.addEventListener('DOMContentLoaded', async () => {
  const exportBtn = document.getElementById('exportBtn');
  const statusDiv = document.getElementById('status');
  const mediaToggle = document.getElementById('mediaToggle') as HTMLInputElement;
  const thoughtsToggle = document.getElementById('thoughtsToggle') as HTMLInputElement;
  const blockedToggle = document.getElementById('blockedToggle') as HTMLInputElement;

  await loadSettings();

  mediaToggle?.addEventListener('change', saveSettings);
  thoughtsToggle?.addEventListener('change', saveSettings);
  blockedToggle?.addEventListener('change', saveSettings);

  function showStatus(message: string, isLoading = false) {
    if (statusDiv) {
      statusDiv.innerHTML = isLoading 
        ? `<span class="spinner"></span>${message}` 
        : message;
      statusDiv.classList.add('show');
      
      if (!isLoading) {
        setTimeout(() => statusDiv.classList.remove('show'), 3000);
      }
    }
  }

  async function loadSettings() {
    try {
      const result = await browser.storage.local.get('exportSettings') as { exportSettings?: ExportSettings };
      const settings: ExportSettings = result.exportSettings || DEFAULT_SETTINGS;

      if (mediaToggle) mediaToggle.checked = settings.withMedia;
      if (thoughtsToggle) thoughtsToggle.checked = settings.includeThoughts;
      if (blockedToggle) blockedToggle.checked = settings.includeBlocked;
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    }
  }

  async function saveSettings() {
    try {
      const settings: ExportSettings = {
        withMedia: mediaToggle?.checked ?? true,
        includeThoughts: thoughtsToggle?.checked ?? true,
        includeBlocked: blockedToggle?.checked ?? true
      };
      await browser.storage.local.set({ exportSettings: settings });
      console.log('Настройки сохранены:', settings);
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
    }
  }

exportBtn?.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    showStatus('❌ Ошибка: вкладка не найдена');
    return;
  }

  if (!tab.url?.startsWith('https://aistudio.google.com/')) {
    showStatus('⚠️ Откройте чат в AI Studio');
    return;
  }

  try {
    showStatus('🔄 Извлекаю данные...', true);
    
    const exportOptions: ExportSettings = {
      withMedia: mediaToggle?.checked ?? true,
      includeThoughts: thoughtsToggle?.checked ?? true,
      includeBlocked: blockedToggle?.checked ?? true
    };

    const response = await browser.tabs.sendMessage(tab.id, { 
      type: 'EXTRACT_AND_DOWNLOAD',
      ...exportOptions
    }) as ScriptResponse;

    console.log('Response from content script:', response);

    if (response && !response.success) {
      const errorMsg = response.error || 'Не удалось извлечь данные';
      console.error('Export failed:', errorMsg);
      showStatus(`❌ Ошибка: ${errorMsg}`);
    } else {
      showStatus('✅ Загрузка начата');
      setTimeout(() => window.close(), 1500);
    }
  } catch (error) {
    console.error('Export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    showStatus(`❌ Ошибка: ${errorMessage}`);
  }
});

});


/**
 * Google AI Studio Chat Exporter
 * Author: mkultra69
 * GitHub: https://github.com/MKultra6969
 * Website: https://mk69.su
 */
