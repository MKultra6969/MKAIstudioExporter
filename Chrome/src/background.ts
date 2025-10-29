import browser from 'webextension-polyfill';
import JSZip from 'jszip';

interface MediaPayload {
  type: string;
  url: string;
  filename: string;
}

interface MessagePayload {
  sender: string;
  text: string;
  media: MediaPayload[];
}

interface DownloadPayload {
  title: string;
  messages: MessagePayload[];
  withMedia: boolean;
}

interface RuntimeMessage {
  type: string;
  payload?: DownloadPayload;
}


// СВЯТОЙ ОБРАБОТЧИК
browser.runtime.onMessage.addListener(async (request: unknown) => {
  const message = request as RuntimeMessage;

  if (message.type === 'DOWNLOAD_CHAT' && message.payload) {
    try {
      await processAndDownloadChat(message.payload);
      return { success: true };
    } catch (error) {
      const err = error as Error;
      console.error('Background script error:', err);
      return { success: false, error: err.message };
    }
  }
});

function generateMarkdown(title: string, messages: MessagePayload[], withMedia: boolean): string {
  let markdownContent = `# ${title}\n\n`;
  markdownContent += `Экспортировано: ${new Date().toLocaleString('ru-RU')}\n\n---\n\n`;

  messages.forEach((msg) => {
    markdownContent += `## ${msg.sender}\n\n`;
    const formattedText = msg.text.replace(/\n/g, '  \n');
    markdownContent += `${formattedText}\n\n`;

    if (withMedia && msg.media.length > 0) {
      msg.media.forEach((m) => {
        if (m.type === 'image') {
          markdownContent += `![${m.filename}](${m.filename})\n\n`;
        } else {
          markdownContent += `[${m.filename}](${m.filename})\n\n`;
        }
      });
    }
    markdownContent += `---\n\n`;
  });
  return markdownContent;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    throw new Error('Offscreen API not available');
  }

  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    
    if (!hasDocument) {
      console.log('Creating offscreen document...');
      
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('src/offscreen.html'),
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Need to create Blob URLs for downloads'
      });
      
      console.log('Offscreen document created');
    }

    const maxRetries = 10;
    const retryDelay = 200;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'PING' }) as { ready: boolean };
        
        if (response && response.ready) {
          console.log('Offscreen document ready');
          return;
        }
      } catch (error) {
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw new Error('Offscreen document failed to respond');
  } catch (error) {
    console.error('Offscreen document error:', error);
    throw error;
  }
}

async function processAndDownloadChat(payload: DownloadPayload) {
  console.log('Processing chat export...', {
    title: payload.title,
    messageCount: payload.messages.length,
    withMedia: payload.withMedia
  });

  const { title, messages, withMedia } = payload;
  const markdownContent = generateMarkdown(title, messages, withMedia);

  if (!withMedia) {
    const encoded = btoa(unescape(encodeURIComponent(markdownContent)));
    const dataUrl = `data:text/markdown;charset=utf-8;base64,${encoded}`;
    
    try {
      await browser.downloads.download({
        url: dataUrl,
        filename: `${title}.md`,
        saveAs: true
      });
      console.log('MD file download started successfully');
    } catch (error) {
      console.error('MD download error:', error);
      throw error;
    }
    return;
  }

  const zip = new JSZip();
  zip.file(`${title}.md`, markdownContent);

  const mediaPromises = messages
    .flatMap(msg => msg.media)
    .map(async (media) => {
      try {
        const response = await fetch(media.url);
        if (!response.ok) {
          console.warn(`Не удалось скачать: ${media.url}, статус: ${response.status}`);
          return;
        }
        const blob = await response.blob();
        zip.file(media.filename, blob);
      } catch (error) {
        console.error(`Ошибка при загрузке ${media.url}:`, error);
      }
    });

  await Promise.all(mediaPromises);

  const zipBlob = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9
    }
  });

  if (typeof chrome !== 'undefined' && chrome.offscreen) {
    try {
      await ensureOffscreenDocument();
      
      console.log('Sending message to offscreen document...');
      
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_BLOB_URL',
        data: zipBlob,
        mimeType: 'application/zip'
      }) as { blobUrl?: string; error?: string };
      
      if (response.error) {
        throw new Error(response.error);
      }

      if (response.blobUrl) {
        await browser.downloads.download({
          url: response.blobUrl,
          filename: `${title}.zip`,
          saveAs: true
        });
        console.log('Скачивание ZIP-архива начато');
      } else {
        throw new Error('No blob URL returned from offscreen document');
      }
    } catch (error) {
      console.error('Ошибка скачивания ZIP:', error);
      console.log('Trying fallback method...');
      const dataUrl = `data:application/zip;base64,${zipBlob}`;
      await browser.downloads.download({
        url: dataUrl,
        filename: `${title}.zip`,
        saveAs: true
      });
      console.log('Скачивание ZIP-архива начато (fallback)');
    }
  } else {
    const dataUrl = `data:application/zip;base64,${zipBlob}`;
    try {
      await browser.downloads.download({
        url: dataUrl,
        filename: `${title}.zip`,
        saveAs: true
      });
      console.log('Скачивание ZIP-архива начато (fallback)');
    } catch (error) {
      console.error('Ошибка скачивания ZIP:', error);
      throw error;
    }
  }
}

/**
 * Google AI Studio Chat Exporter
 * Author: mkultra69
 * GitHub: https://github.com/MKultra6969
 * Website: https://mk69.su
 */
