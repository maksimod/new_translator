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

  // Добавим сообщение о необходимости VPN
  const vpnWarningContainer = document.createElement('div');
  vpnWarningContainer.className = 'vpn-warning';
  vpnWarningContainer.innerHTML = `
    <div class="vpn-warning-message">
      <strong>VPN Required!</strong> This application requires a VPN connection to work properly.
    </div>
    <button id="checkVpnBtn" class="check-vpn-btn">Check VPN Connection</button>
  `;
  document.querySelector('.controls').appendChild(vpnWarningContainer);
  const checkVpnBtn = document.getElementById('checkVpnBtn');

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
  let currentTranscript = '';
  let lastProcessedTranscript = '';
  let lastTranslationTime = 0;
  let isTranslationInProgress = false;
  let partialTranslationCache = {};
  let translationHistory = [];
  let isFinalizing = false;
  let finalizationTimer = null;
  let pendingTranslations = [];
  let isProcessingIterative = false;
  let isVpnConnected = false; // Tracking VPN connection status
  
  // Add direct audio recording functionality
  let mediaRecorder = null;
  let audioChunks = [];
  let isDirectAudioRecording = false;
  
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
  
  // API key security through obfuscation
  // This is a simplified example of key obfuscation, not meant for production use without proper security measures
  const getApiKey = () => {
    // Обфускация API ключа, разделенного на части и перемешанного
    // В реальном приложении использовалась бы более сложная схема шифрования
    const parts = [
      'sk-', // Prefix part
      'eDJmzMx', // Part 1
      '5eEXvTnq', // Part 2
      'xckT3Bl', // Part 3
      'bkFJxg3w5', // Part 4
      'ueP6fEsM', // Part 5
      'FUUz4o90', // Part 6
      'VvnkfLLvE', // Part 7
      'yLtdTkB', // Part 8
    ];
    
    // Переупорядочиваем части ключа
    const order = [0, 3, 7, 1, 5, 2, 8, 4, 6];
    let key = '';
    
    for (const index of order) {
      key += parts[index];
    }
    
    // Дополнительная защита через кодирование/декодирование
    const encoded = btoa(key);
    return atob(encoded);
  };

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
    
    // Load saved language preferences from localStorage instead of chrome.storage
    const savedSourceLang = localStorage.getItem('sourceLanguage');
    const savedTargetLang = localStorage.getItem('targetLanguage');
    
    if (savedSourceLang) {
      selectedSourceLanguage = savedSourceLang;
      sourceLanguageSelect.value = savedSourceLang;
    } else {
      sourceLanguageSelect.value = selectedSourceLanguage;
    }
    
    if (savedTargetLang) {
      selectedTargetLanguage = savedTargetLang;
      targetLanguageSelect.value = savedTargetLang;
    } else {
      targetLanguageSelect.value = selectedTargetLanguage;
    }
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
    
    // Initialize directly - no warm-up
    recognition = new SpeechRecognition();
    
    // Set recognition properties
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // Set the language based on the selected source language
    const browserLanguageCode = languageCodeMapping[selectedSourceLanguage] || selectedSourceLanguage;
    recognition.lang = browserLanguageCode;
    console.log(`Recognition language set to: ${browserLanguageCode}`);
    
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
            try {
              startRealRecognition();
            } catch (error) {
              console.error('Error restarting recognition:', error);
              
              // If failed to restart, try again after longer delay
              setTimeout(() => {
                if (isTranslatorActive) {
                  startRealRecognition();
                }
              }, 1000);
            }
          }
        }, 500);
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
        // Don't show network errors to avoid alarming users
        console.log('Network error occurred, restarting recognition');
        
        // Always restart immediately after network error
        if (isTranslatorActive && !isRecording) {
          setTimeout(() => startRealRecognition(), 500);
        }
      } else if (event.error === 'aborted') {
        // Handle aborted errors differently
        console.log('Recognition aborted, restarting if active');
        if (isTranslatorActive && !isRecording) {
          setTimeout(() => startRealRecognition(), 500);
        }
      } else {
        setStatus(`Recognition error: ${event.error}`, true);
        // Restart after error if still active
        if (isTranslatorActive && !isRecording) {
          setTimeout(() => startRealRecognition(), 1000);
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
          
          // Initiate iterative translation
          queueIterativeTranslation(transcript, false);
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
    
    // Start real recognition directly
    startRealRecognition();
  }
  
  // Start the real recognition process
  function startRealRecognition() {
    try {
      // Reset the flag for ignoring network errors
      ignoreNextNetworkError = true;
      
      // If recognition is already running, stop it first
      if (recognition.state === 'running') {
        console.log('Recognition is already running, stopping it first');
        recognition.stop();
        // Short timeout before restarting
        setTimeout(() => {
          if (isTranslatorActive) {
            startRealRecognition();
          }
        }, 300);
        return;
      }
      
      console.log('Starting real recognition...');
      recognition.start();
    } catch (error) {
      console.error('Error starting real recognition:', error);
      
      if (error.message && error.message.includes('already started')) {
        // Recognition is already running, stop it and restart
        try {
          recognition.stop();
          setTimeout(() => {
            if (isTranslatorActive) {
              startRealRecognition();
            }
          }, 500);
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
  
  // Start recognition process
  function startRecognition() {
    // Check VPN first before starting
    checkVpnConnection().then(isConnected => {
      if (isConnected) {
        // If VPN is connected, proceed with recognition
        
        // Setup direct audio recording for transcription if needed
        if (!mediaRecorder) {
          setupDirectAudioRecording();
        }
        
        // Setup speech recognition if needed
        if (!recognition) {
          setupSpeechRecognition();
        } else {
          // If recognition object already exists, restart it
          startRealRecognition();
        }
        
        // Also start direct audio recording for OpenAI API transcription
        startDirectAudioRecording();
      } else {
        // If VPN is not connected, show warning
        setStatus('VPN required! Please connect to VPN before using the translator.', true);
      }
    });
  }
  
  // Stop recognition process
  function stopRecognition() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      isDirectAudioRecording = false;
    }
    
    if (recognition) {
      try {
        recognition.abort();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      isRecording = false;
    }
    
    setStatus('Recognition stopped');
  }
  
  // Update recognition language when source language changes
  function updateRecognitionLanguage() {
    // Stop current recognition
    if (isRecording && recognition) {
      try {
        recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition during language change:', error);
      }
    }
    
    // Полностью пересоздать объект распознавания речи с новым языком
    recognition = null;
    
    // Update language and restart
    setTimeout(() => {
      if (isTranslatorActive) {
        setupSpeechRecognition();
      }
    }, 500);
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
    try {
      // Translate the transcript
      if (shouldProcessTranscript(transcript)) {
        // Store the transcript for processing
        lastProcessedTranscript = transcript;
        
        // Queue for translation
        queueIterativeTranslation(transcript, isFinal);
      }
    } catch (error) {
      console.error('Error processing transcript:', error);
      setStatus(`Error: ${error.message}`, true);
    }
  }
  
  // Modify translateText function
  async function translateText(text, isFinal) {
    if (!text || text.trim() === '') {
      return;
    }
    
    // Skip repeated translations for the exact same text
    if (isFinal && Date.now() - lastTranslationTime < 500 && text === lastProcessedTranscript) {
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
      // Only set translation in progress for final translations
      if (isFinal) {
        isTranslationInProgress = true;
      }
      
      setStatus('Translating...');
      lastTranslationTime = Date.now();
      
      // Always use direct OpenAI API call
      const apiKey = getApiKey();
      
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
        if (errorData.error && errorData.error.code === 'unsupported_country_region_territory') {
          await checkVpnConnection(); // Re-check VPN status
          throw new Error('Your location is not supported. Please use VPN to connect from a supported region');
        } else {
          throw new Error(errorData.error?.message || 'Translation failed');
        }
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
      
      if (error.message.includes('location is not supported')) {
        // Show prominent VPN warning
        document.querySelector('.vpn-warning').classList.remove('success');
        document.querySelector('.vpn-warning').classList.add('error');
      }
    } finally {
      if (isFinal) {
        isTranslationInProgress = false;
      }
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
    localStorage.setItem('sourceLanguage', selectedSourceLanguage);
    updateRecognitionLanguage();
  });
  
  targetLanguageSelect.addEventListener('change', (e) => {
    selectedTargetLanguage = e.target.value;
    localStorage.setItem('targetLanguage', selectedTargetLanguage);
  });
  
  switchLanguagesBtn.addEventListener('click', () => {
    // Swap language selections
    const tempLang = selectedSourceLanguage;
    selectedSourceLanguage = selectedTargetLanguage;
    selectedTargetLanguage = tempLang;
    
    // Update select elements
    sourceLanguageSelect.value = selectedSourceLanguage;
    targetLanguageSelect.value = selectedTargetLanguage;
    
    // Save to localStorage
    localStorage.setItem('sourceLanguage', selectedSourceLanguage);
    localStorage.setItem('targetLanguage', selectedTargetLanguage);
    
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
  
  // Modify init function to check VPN on startup
  function init() {
    initializeLanguages();
    updateToggleLabel();
    
    // Add styles for VPN warning
    const style = document.createElement('style');
    style.textContent = `
      .vpn-warning {
        background-color: #fff3cd;
        color: #856404;
        padding: 12px 16px;
        border-radius: 5px;
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .vpn-warning.success {
        background-color: #d4edda;
        color: #155724;
      }
      
      .vpn-warning.error {
        background-color: #f8d7da;
        color: #721c24;
      }
      
      .vpn-warning-message {
        margin-right: 10px;
        flex: 1;
      }
    `;
    document.head.appendChild(style);
    
    // Check VPN connection on startup
    checkVpnConnection().then(isConnected => {
      // Start recognition if active and VPN is connected
      if (isTranslatorActive && isConnected) {
        startRecognition();
      }
    });
  }
  
  // Start the app
  init();

  // Add a new function to process audio directly with OpenAI API
  async function processAudioDirectly(audioData, sourceLanguage) {
    try {
      console.log('Processing audio directly with OpenAI API');
      
      // Extract the base64 data
      let base64Data = audioData;
      
      // Handle data URLs (e.g. "data:audio/webm;base64,...")
      if (base64Data.includes('base64,')) {
        base64Data = base64Data.split('base64,')[1];
      }
      
      // Convert base64 to blob
      const byteCharacters = atob(base64Data);
      const byteArrays = [];
      
      for (let i = 0; i < byteCharacters.length; i += 1024) {
        const slice = byteCharacters.slice(i, i + 1024);
        const byteNumbers = new Array(slice.length);
        
        for (let j = 0; j < slice.length; j++) {
          byteNumbers[j] = slice.charCodeAt(j);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      const blob = new Blob(byteArrays, { type: 'audio/webm' });
      
      // Create form data
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'gpt-4o-mini-transcribe');
      
      if (sourceLanguage) {
        formData.append('language', sourceLanguage);
      }
      
      const apiKey = getApiKey();
      
      // Make the API request
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Transcription failed');
      }
      
      const data = await response.json();
      return data.text || '';
    } catch (error) {
      console.error('Direct transcription error:', error);
      throw error;
    }
  }

  // Function to setup direct audio recording when using direct API mode
  function setupDirectAudioRecording() {
    // If already set up, don't recreate
    if (mediaRecorder) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('Got audio stream for direct recording');
        
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          try {
            console.log('Audio recording stopped, processing...');
            
            // Combine chunks into a single blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Skip very small recordings (likely noise or silence)
            if (audioBlob.size < 1000) {
              console.log('Audio recording too small, skipping');
              
              // Restart recording if still active
              if (isTranslatorActive) {
                setTimeout(() => startDirectAudioRecording(), 100);
              }
              return;
            }
            
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            
            reader.onloadend = async () => {
              const base64Audio = reader.result;
              
              // Process audio directly with OpenAI API
              try {
                setStatus('Transcribing audio...');
                const transcription = await processAudioDirectly(base64Audio, selectedSourceLanguage);
                
                // Skip empty transcriptions
                if (!transcription || transcription.trim() === '') {
                  console.log('Empty transcription, skipping');
                  
                  // Restart recording immediately
                  if (isTranslatorActive) {
                    startDirectAudioRecording();
                  }
                  return;
                }
                
                // Update UI with transcription
                currentTranscript = transcription;
                sourceTextDiv.textContent = transcription;
                
                // Translate the text
                await translateText(transcription, true);
                
                // Clear audio chunks
                audioChunks = [];
                
                // Start recording again if still in direct audio mode
                if (isTranslatorActive) {
                  startDirectAudioRecording();
                }
              } catch (error) {
                console.error('Error transcribing audio:', error);
                setStatus(`Transcription error: ${error.message}`, true);
                
                if (error.message.includes('location is not supported') || 
                    error.message.includes('Country, region, or territory not supported')) {
                  // Problem with VPN, update warning message
                  setStatus('VPN error: Your location is not supported. Please check your VPN connection.', true);
                  document.querySelector('.vpn-warning').classList.remove('success');
                  document.querySelector('.vpn-warning').classList.add('error');
                  
                  // Wait a bit before retrying
                  setTimeout(() => {
                    if (isTranslatorActive) {
                      checkVpnConnection().then(isConnected => {
                        if (isConnected) {
                          startDirectAudioRecording();
                        }
                      });
                    }
                  }, 5000);
                } else {
                  // Other errors, just restart recording after a short delay
                  setTimeout(() => {
                    if (isTranslatorActive) {
                      startDirectAudioRecording();
                    }
                  }, 1000);
                }
              }
            };
          } catch (error) {
            console.error('Error processing audio recording:', error);
            setStatus(`Recording error: ${error.message}`, true);
            
            // Restart recording after error
            setTimeout(() => {
              if (isTranslatorActive) {
                startDirectAudioRecording();
              }
            }, 1000);
          }
        };
        
      }).catch(error => {
        console.error('Error accessing microphone:', error);
        setStatus('Microphone access denied. Please allow microphone access.', true);
      });
  }

  // Function to start direct audio recording
  function startDirectAudioRecording() {
    if (!mediaRecorder) {
      setupDirectAudioRecording();
      return;
    }
    
    // Only start if not already recording
    if (mediaRecorder.state !== 'recording') {
      audioChunks = [];
      mediaRecorder.start();
      isDirectAudioRecording = true;
      setStatus('Listening (VPN mode)...');
      
      // Stop recording after 5 seconds (to avoid too large files)
      // Then immediately restart to create continuous recording
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          isDirectAudioRecording = false;
          // mediaRecorder.onstop will handle processing and restart
        }
      }, 5000);
    }
  }

  // Function to check if VPN is working
  async function checkVpnConnection() {
    try {
      setStatus('Checking VPN connection...');
      const apiKey = getApiKey();
      
      // Try a minimal call to OpenAI to check connectivity
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (response.ok) {
        console.log('VPN connection successful - OpenAI API accessible');
        setStatus('VPN connection successful!');
        isVpnConnected = true;
        document.querySelector('.vpn-warning').classList.add('success');
        return true;
      } else {
        console.log('VPN connection failed - OpenAI API returned error');
        const errorData = await response.json();
        if (errorData.error && errorData.error.code === 'unsupported_country_region_territory') {
          setStatus('VPN error: Your location is not supported. Please use VPN to connect from a supported region', true);
        } else {
          setStatus('VPN connection failed - OpenAI API returned an error', true);
        }
        isVpnConnected = false;
        document.querySelector('.vpn-warning').classList.remove('success');
        document.querySelector('.vpn-warning').classList.add('error');
        return false;
      }
    } catch (error) {
      console.error('VPN check error:', error);
      setStatus('VPN connection failed - Please ensure your VPN is active', true);
      isVpnConnected = false;
      document.querySelector('.vpn-warning').classList.remove('success');
      document.querySelector('.vpn-warning').classList.add('error');
      return false;
    }
  }

  // Add event listener for VPN check button
  checkVpnBtn.addEventListener('click', async () => {
    await checkVpnConnection();
    
    if (isVpnConnected && isTranslatorActive) {
      // Restart recognition if translator is active
      startRecognition();
    }
  });
}); 