chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ready: true });
    return true;
  }
  
  if (message.type === 'CREATE_BLOB_URL') {
    const { data, mimeType } = message;
    
    try {
      const byteCharacters = atob(data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      
      const blobUrl = URL.createObjectURL(blob);
      
      sendResponse({ blobUrl });
    } catch (error) {
      console.error('Offscreen error:', error);
      sendResponse({ error: String(error) });
    }
    
    return true;
  }
});

console.log('Offscreen document loaded');

/**
 * Google AI Studio Chat Exporter
 * Author: mkultra69
 * GitHub: https://github.com/MKultra6969
 * Website: https://mk69.su
 */