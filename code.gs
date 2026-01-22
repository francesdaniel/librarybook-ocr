function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Text Vision Capture - NYPL')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function processImage(imageDataUrl) {
  try {
    const base64Data = imageDataUrl.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png');
    
    const visionApiKey = PropertiesService.getScriptProperties().getProperty('VISION_API_KEY');
    
    if (!visionApiKey) {
      return {
        success: false,
        error: 'Vision API key not configured. Please add VISION_API_KEY to Script Properties with value: AIzaSyDdAdxvE7oLb0QBdB_z5_7eU0r1BkYZw1o',
        hasApiKey: false
      };
    }
    
    const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + visionApiKey;
    const payload = {
      requests: [{
        image: { content: base64Data },
        features: [
          { type: 'TEXT_DETECTION', maxResults: 1 },
          { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
        ]
      }]
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    Logger.log('Vision API Response: ' + JSON.stringify(result));
    
    if (result.responses && result.responses[0]) {
      const resp = result.responses[0];
      
      let detectedText = '';
      if (resp.fullTextAnnotation) {
        detectedText = resp.fullTextAnnotation.text;
      } else if (resp.textAnnotations && resp.textAnnotations.length > 0) {
        detectedText = resp.textAnnotations[0].description;
      }
      
      if (detectedText) {
        return {
          success: true,
          text: detectedText,
          hasApiKey: true,
          fullTextAnnotation: resp.fullTextAnnotation,
          textAnnotations: resp.textAnnotations
        };
      }
    }
    
    return { 
      success: false, 
      error: 'No text detected in image',
      rawResponse: JSON.stringify(result)
    };
  } catch (error) {
    Logger.log('Error in processImage: ' + error.toString());
    return { 
      success: false, 
      error: error.toString(),
      stack: error.stack
    };
  }
}

function detectMarginSymbols(text) {
  const symbols = {
    sentences: [],
    lexicon: [],
    workingLanguage: null,
    corollary: [],
    paragraphs: []
  };
  
  const lines = text.split('\n');
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('X ') || /^\s*X\s+/.test(line)) {
      symbols.sentences.push({
        line: index + 1,
        text: trimmed.replace(/^X\s+/, '')
      });
    }
    
    if (trimmed.includes('—') || trimmed.startsWith('— ')) {
      symbols.lexicon.push({
        line: index + 1,
        text: trimmed.replace(/^—\s+/, '')
      });
    }
    
    if (trimmed.startsWith('> ') || trimmed.startsWith('>')) {
      symbols.workingLanguage = {
        line: index + 1,
        text: trimmed.replace(/^>\s+/, '')
      };
    }
    
    if (trimmed.includes('Ξ') || trimmed.includes('Xi ') || trimmed.includes('E ')) {
      symbols.corollary.push({
        line: index + 1,
        text: trimmed.replace(/Ξ\s+/, '').replace(/Xi\s+/, '').replace(/^E\s+/, '')
      });
    }
    
    if (trimmed.startsWith('X|') || trimmed.includes('X|')) {
      symbols.paragraphs.push({
        line: index + 1,
        text: trimmed.replace(/^X\|\s+/, '')
      });
    }
  });
  
  return {
    success: true,
    symbols: symbols,
    totalMarkers: symbols.sentences.length + symbols.lexicon.length + 
                   (symbols.workingLanguage ? 1 : 0) + symbols.corollary.length + 
                   symbols.paragraphs.length
  };
}

function saveToGoogleDrive(data, filename, mimeType) {
  try {
    const folder = getFolderOrCreate('Text Vision Captures');
    const blob = Utilities.newBlob(data, mimeType, filename);
    const file = folder.createFile(blob);
    
    return {
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: file.getName()
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getFolderOrCreate(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}
