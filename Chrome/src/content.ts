import browser from 'webextension-polyfill';
import type { Runtime } from 'webextension-polyfill';

interface ExtractRequest {
  type: string;
  withMedia: boolean;
  includeThoughts: boolean;
  includeBlocked: boolean;
}

browser.runtime.onMessage.addListener(async (request: unknown, _sender: Runtime.MessageSender) => {
  const message = request as ExtractRequest;

  if (message.type === 'EXTRACT_AND_DOWNLOAD') {
    try {
      await extractChatData(
        message.withMedia,
        message.includeThoughts,
        message.includeBlocked
      );
      return { success: true };
    } catch (err: any) {
      console.error("AI Studio Exporter Error:", err);
      return { success: false, error: err.message };
    }
  }
});

async function extractChatData(
  withMedia: boolean,
  includeThoughts: boolean,
  includeBlocked: boolean
) {
  
  console.log(`AI Studio Exporter: Начинаю сбор данных... (медиа: ${withMedia}, раздумья: ${includeThoughts}, заблокированное: ${includeBlocked})`);

  const chatTitle = document.querySelector('h1')?.textContent?.trim() 
    || document.title
    || `aistudio-chat-${new Date().toISOString().split('T')[0]}`;

  interface ExtractedMessage {
    sender: 'User' | 'Model' | 'Blocked' | 'Thoughts';
    text: string;
    media: {
      type: 'image' | 'file';
      url: string;
      filename: string;
    }[];
  }

  const messages: ExtractedMessage[] = [];
  const messageElements = document.querySelectorAll('ms-chat-turn');
  
  console.log(`Найдено сообщений: ${messageElements.length}`);

  for (const element of messageElements) {
    const turnElement = element as HTMLElement;
    
    const containerDiv = turnElement.querySelector('.virtual-scroll-container');
    const role = containerDiv?.getAttribute('data-turn-role');
    
    const chatTurnContainer = turnElement.querySelector('.chat-turn-container');
    const isUser = chatTurnContainer?.classList.contains('user') || role === 'User';
    
    const isBlocked = turnElement.querySelector('ms-prompt-feedback') !== null;
    const hasThoughts = turnElement.querySelector('ms-thought-chunk') !== null;
    
    if (isBlocked && !includeBlocked) {
      continue;
    }
    
    if (hasThoughts && !includeThoughts) {
      if (!isUser && !isBlocked) {
        const textChunks = turnElement.querySelectorAll('ms-text-chunk ms-cmark-node span');
        const textParts: string[] = [];
        
        textChunks.forEach(span => {
          const spanText = (span as HTMLElement).textContent?.trim();
          if (spanText) {
            textParts.push(spanText);
          }
        });
        
        if (textParts.length > 0) {
          const text = textParts.join('\n\n');
          const media: ExtractedMessage['media'] = [];
          
          if (withMedia) {
            const images = turnElement.querySelectorAll('ms-prompt-chunk img');
            for (const img of images) {
              const imgElement = img as HTMLImageElement;
              if (imgElement.src && !imgElement.src.includes('icon')) {
                const filename = extractFilename(imgElement.src) 
                  || `image_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
                media.push({ type: 'image', url: imgElement.src, filename });
              }
            }
          }
          
          messages.push({ sender: 'Model', text, media });
        }
      }
      continue;
    }
    
    let sender: ExtractedMessage['sender'];
    if (isUser) {
      sender = 'User';
    } else if (isBlocked) {
      sender = 'Blocked';
    } else if (hasThoughts) {
      sender = 'Thoughts';
    } else {
      sender = 'Model';
    }

    let text = '';
    
    if (sender === 'Blocked') {
      const blockButton = turnElement.querySelector('ms-prompt-feedback button[iconname="warning"]');
      text = blockButton?.textContent?.trim() || 'Content blocked';
    } else if (sender === 'Thoughts') {
      const thoughtChunks = turnElement.querySelectorAll('ms-thought-chunk p span');
      const thoughtParts: string[] = [];
      
      thoughtChunks.forEach(span => {
        const spanText = (span as HTMLElement).textContent?.trim();
        if (spanText) {
          thoughtParts.push(spanText);
        }
      });
      
      text = thoughtParts.join('\n\n');
      
      const textChunks = turnElement.querySelectorAll('ms-text-chunk ms-cmark-node span');
      const textParts: string[] = [];
      
      textChunks.forEach(span => {
        const spanText = (span as HTMLElement).textContent?.trim();
        if (spanText) {
          textParts.push(spanText);
        }
      });
      
      if (textParts.length > 0) {
        text = `[Thoughts]\n${text}\n\n[Response]\n${textParts.join('\n\n')}`;
      } else {
        text = `[Thoughts]\n${text}`;
      }
    } else {
      const textChunks = turnElement.querySelectorAll('ms-text-chunk ms-cmark-node span');
      const textParts: string[] = [];
      
      textChunks.forEach(span => {
        const spanText = (span as HTMLElement).textContent?.trim();
        if (spanText) {
          textParts.push(spanText);
        }
      });
      
      text = textParts.join('\n\n');
    }

    const media: ExtractedMessage['media'] = [];
    
    if (withMedia && sender !== 'Blocked') {
      const images = turnElement.querySelectorAll('ms-prompt-chunk img');
      for (const img of images) {
        const imgElement = img as HTMLImageElement;
        if (imgElement.src && !imgElement.src.includes('icon')) {
          const filename = extractFilename(imgElement.src) 
            || `image_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
          media.push({ type: 'image', url: imgElement.src, filename });
        }
      }

      const fileLinks = turnElement.querySelectorAll('a[download], a[href*="/file/"]');
      for (const link of fileLinks) {
        const linkElement = link as HTMLAnchorElement;
        const filename = linkElement.download 
          || extractFilename(linkElement.href) 
          || `file_${Date.now()}.bin`;
        media.push({ type: 'file', url: linkElement.href, filename });
      }
    }

    if (text || media.length > 0) {
      messages.push({ sender, text, media });
    }
  }
  
  if (messages.length === 0) {
    throw new Error("Сообщения не найдены. Возможно, чат пустой.");
  }

  console.log(`Обработано ${messages.length} сообщений`);


try {
  const responseFromBackground = await browser.runtime.sendMessage({
    type: 'DOWNLOAD_CHAT',
    payload: {
      title: sanitizeFilename(chatTitle),
      messages: messages,
      withMedia: withMedia
    }
  }) as { success: boolean; error?: string };

  if (!responseFromBackground?.success) {
    throw new Error(responseFromBackground?.error || 'Background script failed');
  }
  
  console.log('Export completed successfully');
  return;
  
} catch (e) {
  const err = e as Error;
  console.error('Background communication error:', err);
  throw new Error(`Failed to communicate with background script: ${err.message}`);
}

}

function extractFilename(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    const filename = decodeURIComponent(parts[parts.length - 1]);
    return filename && filename.length > 0 ? filename : null;
  } catch {
    return null;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * Google AI Studio Chat Exporter
 * Author: mkultra69
 * GitHub: https://github.com/MKultra6969
 * Website: https://mk69.su
 */