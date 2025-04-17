document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const switchLanguagesBtn = document.getElementById('switchLanguages');
  const translatorToggle = document.getElementById('translatorToggle');
  const toggleLabel = document.querySelector('.toggle-label');
  const sourceTextDiv = document.getElementById('sourceText');
  const translatedTextDiv = document.getElementById('translatedText');
  const translatedHistoryDiv = document.getElementById('translatedHistory');
  const copyButton = document.getElementById('copyButton');
  const statusElement = document.getElementById('status');
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');

  // State variables
  let languages = [];
  let isTranslatorActive = true;
  let recognition = null;
  let isRecording = false;
  let selectedSourceLanguage = 'ru'; // Default to Russian
  let selectedTargetLanguage = 'en'; // Default to English
  let silenceTimer = null;
  let lastTranscriptTime = Date.now();
  let isFirstRecognition = true;
  let ignoreNextNetworkError = true;
  let hasStartedRealRecognition = false;
  let currentTranscript = '';
  let lastProcessedTranscript = '';
  let lastTranslationTime = 0;
  let isTranslationInProgress = false;
  let partialTranslationCache = {};
  let translationHistory = [];
  let isFinalizing = false;
  let finalizationTimer = null;
  let apiKey = '';
  
  // Language code mapping for Web Speech API
  const languageCodeMapping = {
    'en': 'en-US',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt': 'pt-PT',
    'ru': 'ru-RU',
    'zh': 'zh-CN',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'ar': 'ar-SA',
    'hi': 'hi-IN'
  };

  // Define supported languages
  const predefinedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' }
  ];
  
  // Load the API key from storage
  function loadApiKey() {
    chrome.storage.sync.get(['openaiApiKey'], (result) => {
      if (result.openaiApiKey) {
        apiKey = result.openaiApiKey;
        apiKeyInput.value = apiKey;
        setStatus('API key loaded');
      } else {
        setStatus('Please enter your OpenAI API key', true);
      }
    });
  }
  
  // Save API key to storage
  function saveApiKey() {
    apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ openaiApiKey: apiKey }, () => {
        setStatus('API key saved');
      });
    } else {
      setStatus('Please enter a valid API key', true);
    }
  }

  // Check browser support for Web Speech API
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    setStatus('Your browser does not support speech recognition. Please use Chrome or Edge.', true);
    translatorToggle.disabled = true;
    return;
  }

  // Initialize language selection
  function initializeLanguages() {
    languages = predefinedLanguages;
    
    // Populate language dropdowns
    populateLanguageDropdowns();
    
    // Load saved language preferences from storage
    chrome.storage.sync.get(['sourceLanguage', 'targetLanguage'], (result) => {
      if (result.sourceLanguage) {
        selectedSourceLanguage = result.sourceLanguage;
        sourceLanguageSelect.value = result.sourceLanguage;
      } else {
        sourceLanguageSelect.value = selectedSourceLanguage;
      }
      
      if (result.targetLanguage) {
        selectedTargetLanguage = result.targetLanguage;
        targetLanguageSelect.value = result.targetLanguage;
      } else {
        targetLanguageSelect.value = selectedTargetLanguage;
      }
    });
  }

  // Populate language dropdown options
  function populateLanguageDropdowns() {
    // Clear existing options
    sourceLanguageSelect.innerHTML = '';
    targetLanguageSelect.innerHTML = '';
    
    // Add options for each language
    languages.forEach(language => {
      const sourceOption = document.createElement('option');
      sourceOption.value = language.code;
      sourceOption.textContent = language.name;
      sourceLanguageSelect.appendChild(sourceOption);
      
      const targetOption = document.createElement('option');
      targetOption.value = language.code;
      targetOption.textContent = language.name;
      targetLanguageSelect.appendChild(targetOption);
    });
  }

  // Initialize speech recognition
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // Initialize two separate recognition instances
    // One for warming up and one for actual usage
    const warmupRecognition = new SpeechRecognition();
    recognition = new SpeechRecognition();
    
    // Set recognition properties for both instances
    warmupRecognition.continuous = false;
    warmupRecognition.interimResults = false;
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // Set the language based on the selected source language
    const browserLanguageCode = languageCodeMapping[selectedSourceLanguage] || selectedSourceLanguage;
    warmupRecognition.lang = browserLanguageCode;
    recognition.lang = browserLanguageCode;
    console.log(`Recognition language set to: ${browserLanguageCode}`);
    
    // Warm-up recognition events
    warmupRecognition.onstart = () => {
      console.log('Warm-up recognition started');
    };
    
    warmupRecognition.onend = () => {
      console.log('Warm-up recognition ended');
      // Start real recognition after warm-up
      setTimeout(() => {
        if (isTranslatorActive && !hasStartedRealRecognition) {
          hasStartedRealRecognition = true;
          startRealRecognition();
        }
      }, 100);
    };
    
    warmupRecognition.onerror = (event) => {
      console.log('Warm-up error:', event.error);
      // Start real recognition anyway
      if (!hasStartedRealRecognition) {
        hasStartedRealRecognition = true;
        startRealRecognition();
      }
    };
    
    // Real recognition events
    recognition.onstart = () => {
      isRecording = true;
      setStatus('Listening...');
      console.debug('Recognition started, ready to capture speech');
    };
    
    recognition.onend = () => {
      isRecording = false;
      console.debug('Recognition ended');
      
      // If we have current transcript but got disconnected, try to process it
      if (currentTranscript && currentTranscript.trim() !== '') {
        console.debug('Processing final transcript after disconnection:', currentTranscript);
        processAudioTranscript(currentTranscript, true);
        currentTranscript = '';
      }
      
      if (isTranslatorActive) {
        // Restart recognition after a short delay
        setTimeout(() => {
          if (isTranslatorActive) {
            startRealRecognition();
          }
        }, 300);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Recognition error:', event.error);
      
      if (event.error === 'not-allowed') {
        setStatus('Microphone access denied. Please allow microphone access.', true);
        isTranslatorActive = false;
        translatorToggle.checked = false;
        updateToggleLabel();
      } else if (event.error === 'network') {
        // Ignore the first network error as it's expected
        if (ignoreNextNetworkError) {
          console.log('Ignoring first network error (expected during initialization)');
          ignoreNextNetworkError = false;
        } else {
          // Don't show network errors to avoid alarming users
          console.log('Network error occurred, restarting recognition');
        }
        
        // Always restart immediately after network error
        if (isTranslatorActive && !isRecording) {
          setTimeout(startRealRecognition, 300);
        }
      } else {
        setStatus(`Recognition error: ${event.error}`, true);
        // Restart after error if still active
        if (isTranslatorActive && !isRecording) {
          setTimeout(startRealRecognition, 500);
        }
      }
    };
    
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;
      
      console.debug(`Got ${isFinal ? 'final' : 'interim'} result:`, transcript);
      lastTranscriptTime = Date.now();
      
      // Update the first recognition flag
      if (isFirstRecognition && transcript.trim() !== '') {
        isFirstRecognition = false;
      }
      
      // Ignore very short transcripts (likely noise)
      if (transcript.trim().length <= 1 && !isFinal) {
        return;
      }
      
      // Handle partial results
      if (!isFinal) {
        // Only update the source text if it's a significant change
        if (shouldProcessTranscript(transcript)) {
          currentTranscript = transcript;
          sourceTextDiv.textContent = transcript;
          
          // Start finalization timer on each new result
          resetFinalizationTimer();
        }
      } else {
        // For final results, update current transcript and process it
        currentTranscript = transcript;
        sourceTextDiv.textContent = transcript;
        
        // Clear any pending finalization
        if (finalizationTimer) {
          clearTimeout(finalizationTimer);
          finalizationTimer = null;
        }
        
        // Process the final transcript
        processAudioTranscript(transcript, true);
      }
    };
    
    // Start the warm-up process
    function startWarmUp() {
      try {
        console.log('Starting warm-up recognition...');
        warmupRecognition.start();
      } catch (error) {
        console.error('Error starting warm-up recognition:', error);
        // Start real recognition anyway
        if (!hasStartedRealRecognition) {
          hasStartedRealRecognition = true;
          startRealRecognition();
        }
      }
    }
    
    // Start the real recognition process
    function startRealRecognition() {
      try {
        ignoreNextNetworkError = true;
        console.log('Starting real recognition...');
        recognition.start();
      } catch (error) {
        console.error('Error starting real recognition:', error);
        
        if (error.message.includes('already started')) {
          // Recognition is already running, stop it and restart
          try {
            recognition.stop();
            setTimeout(() => {
              if (isTranslatorActive) {
                startRealRecognition();
              }
            }, 300);
          } catch (stopError) {
            console.error('Error stopping recognition:', stopError);
          }
        } else {
          // For other errors, retry after a delay
          setTimeout(() => {
            if (isTranslatorActive) {
              startRealRecognition();
            }
          }, 1000);
        }
      }
    }
    
    // Start the recognition process
    startWarmUp();
  }

  // Start finalization timer for handling pauses in speech
  function startFinalizationTimer() {
    if (finalizationTimer) {
      clearTimeout(finalizationTimer);
    }
    
    finalizationTimer = setTimeout(() => {
      if (currentTranscript && !isFinalizing) {
        finalizeCurrentPhrase();
      }
    }, 1500); // Finalize after 1.5 seconds of silence
  }
  
  // Reset the finalization timer
  function resetFinalizationTimer() {
    if (finalizationTimer) {
      clearTimeout(finalizationTimer);
      finalizationTimer = null;
    }
    
    // Start a new timer
    startFinalizationTimer();
  }
  
  // Finalize the current phrase (treat as if it was final)
  function finalizeCurrentPhrase() {
    isFinalizing = true;
    console.log('Finalizing current phrase due to pause:', currentTranscript);
    
    // Process the current transcript
    processAudioTranscript(currentTranscript, true).then(() => {
      // Clear the current transcript
      currentTranscript = '';
      isFinalizing = false;
    }).catch(error => {
      console.error('Error during manual finalization:', error);
      isFinalizing = false;
    });
  }
  
  // Add a translation to the history
  function addTranslationToHistory(translation) {
    // Don't add empty or whitespace-only translations
    if (!translation || !translation.trim()) {
      return;
    }
    
    // Don't add duplicates of the last translation
    if (translationHistory.length > 0 && 
        translationHistory[translationHistory.length - 1] === translation) {
      return;
    }
    
    // Add to history array
    translationHistory.push(translation);
    
    // Create and append history item element
    const historyItem = document.createElement('div');
    historyItem.classList.add('history-item');
    historyItem.textContent = translation;
    translatedHistoryDiv.appendChild(historyItem);
    
    // Scroll to bottom
    translatedHistoryDiv.scrollTop = translatedHistoryDiv.scrollHeight;
  }
  
  // Start recognition process
  function startRecognition() {
    if (!isRecording && isTranslatorActive) {
      hasStartedRealRecognition = false;
      setupSpeechRecognition();
      setStatus('Starting translator...');
    }
  }
  
  // Stop recognition process
  function stopRecognition() {
    if (isRecording) {
      try {
        recognition.stop();
        setStatus('Translator paused');
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
    }
  }
  
  // Update recognition language when source language changes
  function updateRecognitionLanguage() {
    // Stop current recognition
    if (isRecording) {
      try {
        recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition during language change:', error);
      }
    }
    
    // Update language and restart
    setTimeout(() => {
      if (isTranslatorActive) {
        hasStartedRealRecognition = false;
        setupSpeechRecognition();
      }
    }, 300);
  }
  
  // Check if we should update the transcript display
  function shouldProcessTranscript(transcript) {
    // Skip empty transcripts
    if (!transcript || transcript.trim() === '') {
      return false;
    }
    
    // Process if this is the first recognition
    if (isFirstRecognition) {
      return true;
    }
    
    // Always process if the source text is currently empty
    if (!sourceTextDiv.textContent || sourceTextDiv.textContent.trim() === '') {
      return true;
    }
    
    // Calculate how different the new transcript is from the current one
    const currentText = sourceTextDiv.textContent.trim();
    const newText = transcript.trim();
    
    // If the current text is a prefix of the new text, it's likely continued speech
    if (newText.startsWith(currentText)) {
      return true;
    }
    
    // If the new text is shorter, it might be a recognition error or restart
    if (newText.length < currentText.length * 0.7) {
      return false;
    }
    
    // For other cases, use Levenshtein distance to determine similarity
    const distance = levenshteinDistance(currentText, newText);
    const maxLength = Math.max(currentText.length, newText.length);
    const similarityRatio = 1 - (distance / maxLength);
    
    // If the texts are similar enough, process the update
    return similarityRatio > 0.7;
  }
  
  // Calculate Levenshtein distance between two strings
  function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
    
    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= b.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  // Process audio transcript
  async function processAudioTranscript(transcript, isFinal) {
    // Skip if translation is already in progress
    if (isTranslationInProgress) {
      console.log('Translation already in progress, skipping...');
      return;
    }
    
    try {
      // Translate the transcript only if it's final
      if (isFinal && shouldProcessTranscript(transcript)) {
        // Store the transcript for processing
        lastProcessedTranscript = transcript;
        
        // Translate the text
        await translateText(transcript, true);
      }
    } catch (error) {
      console.error('Error processing transcript:', error);
      setStatus(`Error: ${error.message}`, true);
    }
  }
  
  // Translate text
  async function translateText(text, isFinal) {
    if (!text || text.trim() === '') {
      return;
    }
    
    // Check if API key is available
    if (!apiKey) {
      setStatus('Please enter your OpenAI API key', true);
      return;
    }
    
    // Skip if translation is already in progress
    if (isTranslationInProgress) {
      return;
    }
    
    // Skip repeated translations
    if (Date.now() - lastTranslationTime < 500 && text === lastProcessedTranscript) {
      return;
    }
    
    // Check for cached translation for this exact text
    if (partialTranslationCache[text]) {
      console.log('Using cached translation');
      translatedTextDiv.textContent = partialTranslationCache[text];
      
      if (isFinal) {
        addTranslationToHistory(partialTranslationCache[text]);
      }
      
      return;
    }
    
    try {
      isTranslationInProgress = true;
      setStatus('Translating...');
      lastTranslationTime = Date.now();
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo-0125",
          messages: [
            {
              role: "system",
              content: `You are a translator from ${getLanguageName(selectedSourceLanguage)} to ${getLanguageName(selectedTargetLanguage)}. Translate the following text accurately and naturally, preserving the meaning and tone of the original text.`
            },
            {
              role: "user",
              content: text
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Translation failed');
      }
      
      const data = await response.json();
      const translation = data.choices[0].message.content;
      
      // Cache the translation
      partialTranslationCache[text] = translation;
      
      // Update the translated text
      translatedTextDiv.textContent = translation;
      
      // If this is a final translation, add it to the history
      if (isFinal) {
        addTranslationToHistory(translation);
      }
      
      setStatus('Translation complete');
    } catch (error) {
      console.error('Translation error:', error);
      setStatus(`Translation error: ${error.message}`, true);
    } finally {
      isTranslationInProgress = false;
    }
  }

  // Get language name from code
  function getLanguageName(code) {
    const language = languages.find(lang => lang.code === code);
    return language ? language.name : code;
  }
  
  // Set status message
  function setStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.className = isError ? 'error' : '';
  }
  
  // Update toggle label
  function updateToggleLabel() {
    toggleLabel.textContent = isTranslatorActive ? 'Translator Active' : 'Translator Paused';
  }
  
  // Copy translations to clipboard
  function copyTranslations() {
    let content = '';
    
    // Collect all history items
    const historyItems = translatedHistoryDiv.querySelectorAll('.history-item');
    
    if (historyItems.length > 0) {
      // Add history items
      historyItems.forEach(item => {
        content += item.textContent + '\n\n';
      });
    } else if (translatedTextDiv.textContent.trim()) {
      // If no history, use current translation
      content = translatedTextDiv.textContent;
    }
    
    if (content) {
      navigator.clipboard.writeText(content)
        .then(() => {
          showCopiedNotification();
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          setStatus('Failed to copy text', true);
        });
    }
  }
  
  // Show copied notification
  function showCopiedNotification() {
    // Create notification if it doesn't exist
    let notification = document.querySelector('.copied-notification');
    
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'copied-notification';
      notification.textContent = 'Copied to clipboard!';
      document.body.appendChild(notification);
    }
    
    // Show the notification
    notification.classList.add('show');
    
    // Hide after 2 seconds
    setTimeout(() => {
      notification.classList.remove('show');
    }, 2000);
  }
  
  // Event listeners
  sourceLanguageSelect.addEventListener('change', (e) => {
    selectedSourceLanguage = e.target.value;
    chrome.storage.sync.set({ sourceLanguage: selectedSourceLanguage });
    updateRecognitionLanguage();
  });
  
  targetLanguageSelect.addEventListener('change', (e) => {
    selectedTargetLanguage = e.target.value;
    chrome.storage.sync.set({ targetLanguage: selectedTargetLanguage });
  });
  
  switchLanguagesBtn.addEventListener('click', () => {
    // Swap language selections
    const tempLang = selectedSourceLanguage;
    selectedSourceLanguage = selectedTargetLanguage;
    selectedTargetLanguage = tempLang;
    
    // Update select elements
    sourceLanguageSelect.value = selectedSourceLanguage;
    targetLanguageSelect.value = selectedTargetLanguage;
    
    // Save to storage
    chrome.storage.sync.set({ 
      sourceLanguage: selectedSourceLanguage,
      targetLanguage: selectedTargetLanguage
    });
    
    // Update recognition language
    updateRecognitionLanguage();
  });
  
  translatorToggle.addEventListener('change', () => {
    isTranslatorActive = translatorToggle.checked;
    updateToggleLabel();
    
    if (isTranslatorActive) {
      startRecognition();
    } else {
      stopRecognition();
    }
  });
  
  copyButton.addEventListener('click', copyTranslations);
  
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  
  // Initialize the app
  function init() {
    loadApiKey();
    initializeLanguages();
    updateToggleLabel();
    
    // Start recognition if active
    if (isTranslatorActive) {
      startRecognition();
    }
  }
  
  // Start the app
  init();
}); 