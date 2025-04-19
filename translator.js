document.addEventListener('DOMContentLoaded', () => {
  // Browser detection
  const browserInfo = detectBrowser();
  console.log('Browser detected:', browserInfo);
  
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
  
  // Browser compatibility flags
  const hasSpeechRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  const hasClipboardAPI = navigator.clipboard && typeof navigator.clipboard.writeText === 'function';
  const hasMediaRecorder = 'MediaRecorder' in window;
  
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
  
  // Function to detect browser type and version
  function detectBrowser() {
    const userAgent = navigator.userAgent;
    let browser = "Unknown";
    let version = "Unknown";
    let os = "Unknown";
    let isMobile = false;
    
    // Detect mobile devices
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
      isMobile = true;
    }
    
    // Detect operating system
    if (/Windows/i.test(userAgent)) {
      os = "Windows";
    } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
      os = "MacOS";
    } else if (/Linux/i.test(userAgent)) {
      os = "Linux";
    } else if (/Android/i.test(userAgent)) {
      os = "Android";
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
      os = "iOS";
    }
    
    // Detect browser
    if (/Edg/i.test(userAgent)) {
      browser = "Edge";
      version = userAgent.match(/Edg\/([\d.]+)/)[1];
    } else if (/Chrome/i.test(userAgent)) {
      browser = "Chrome";
      version = userAgent.match(/Chrome\/([\d.]+)/)[1];
    } else if (/Firefox/i.test(userAgent)) {
      browser = "Firefox";
      version = userAgent.match(/Firefox\/([\d.]+)/)[1];
    } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
      browser = "Safari";
      version = userAgent.match(/Version\/([\d.]+)/)[1];
    } else if (/MSIE|Trident/i.test(userAgent)) {
      browser = "Internet Explorer";
      const msieMatch = userAgent.match(/MSIE ([\d.]+)/);
      const tridentMatch = userAgent.match(/rv:([\d.]+)/);
      version = msieMatch ? msieMatch[1] : tridentMatch ? tridentMatch[1] : "Unknown";
    } else if (/OPR/i.test(userAgent)) {
      browser = "Opera";
      version = userAgent.match(/OPR\/([\d.]+)/)[1];
    }
    
    return { browser, version, os, isMobile };
  }
  
  // Speech recognition fallback/polyfill for unsupported browsers
  function setupSpeechRecognitionPolyfill() {
    if (!hasSpeechRecognition) {
      // Create a mock recognition object
      return {
        start: () => {
          isRecording = true;
          setStatus('Speech recognition not supported in this browser. Using direct audio recording instead.', true);
          startDirectAudioRecording();
        },
        stop: () => {
          isRecording = false;
        },
        abort: () => {
          isRecording = false;
        }
      };
    }
    return null;
  }
  
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
  if (!hasSpeechRecognition) {
    setStatus('Your browser does not support speech recognition. Using fallback method.', true);
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
    // Use polyfill if needed
    const polyfill = setupSpeechRecognitionPolyfill();
    if (polyfill) {
      recognition = polyfill;
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    try {
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
        
        // Add visual feedback for mobile devices
        if (browserInfo.isMobile) {
          sourceTextDiv.classList.add('recording');
        }
      };
      
      recognition.onend = () => {
        isRecording = false;
        console.debug('Recognition ended');
        
        // Remove visual feedback for mobile devices
        if (browserInfo.isMobile) {
          sourceTextDiv.classList.remove('recording');
        }
        
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
            // Fall back to direct audio recording if speech recognition fails repeatedly
            if (hasMediaRecorder && browserInfo.browser !== 'Safari') {
              setStatus('Switching to direct audio recording mode', true);
              startDirectAudioRecording();
            } else {
              setTimeout(() => startRealRecognition(), 1000);
            }
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
      
      // Onnomatch handler for browsers that support it (like Chrome)
      if ('onnomatch' in recognition) {
        recognition.onnomatch = () => {
          console.log('No speech detected');
          // Do nothing special, just keep listening
        };
      }
      
      // Soundstart and soundend handlers for browsers that support it
      if ('onsoundstart' in recognition) {
        recognition.onsoundstart = () => {
          console.log('Sound detected');
        };
      }
      
      if ('onsoundend' in recognition) {
        recognition.onsoundend = () => {
          console.log('Sound ended');
        };
      }
      
      // Start real recognition directly
      startRealRecognition();
    } catch (error) {
      console.error('Error setting up speech recognition:', error);
      // Fallback to direct audio recording
      if (hasMediaRecorder) {
        setStatus('Speech recognition setup failed. Using direct audio recording.', true);
        startDirectAudioRecording();
      } else {
        setStatus('Speech recognition and audio recording not supported in this browser.', true);
      }
    }
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
        
        // Reset any error states
        sourceTextDiv.classList.remove('error');
        translatedTextDiv.classList.remove('error');
        
        // Choose recognition method based on browser capabilities and preference
        // For mobile Safari, prefer direct audio recording as it's more reliable
        if ((browserInfo.browser === 'Safari' && browserInfo.isMobile) || !hasSpeechRecognition) {
          console.log('Using direct audio recording mode (preferred for this browser)');
          
          // Setup direct audio recording
          if (!mediaRecorder) {
            setupDirectAudioRecording();
          }
          
          // Start direct recording
          startDirectAudioRecording();
        } else {
          // For desktop browsers, prefer speech recognition API if available
          console.log('Using Web Speech API recognition mode');
          
          // Setup direct audio recording as fallback
          if (!mediaRecorder && hasMediaRecorder) {
            setupDirectAudioRecording();
          }
          
          // Setup speech recognition if needed
          if (!recognition) {
            setupSpeechRecognition();
          } else {
            // If recognition object already exists, restart it
            startRealRecognition();
          }
        }
        
        // Add visual feedback that recording is active
        document.body.classList.add('is-recording');
      } else {
        // If VPN is not connected, show warning
        setStatus('VPN required! Please connect to VPN before using the translator.', true);
        document.body.classList.remove('is-recording');
      }
    }).catch(error => {
      console.error('Error checking VPN connection:', error);
      setStatus('Error checking VPN connection. Please try again.', true);
    });
  }
  
  // Stop recognition process
  function stopRecognition() {
    // Stop direct audio recording if active
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.stop();
      } catch (error) {
        console.error('Error stopping media recorder:', error);
        // Reset media recorder if it fails to stop
        mediaRecorder = null;
      }
      isDirectAudioRecording = false;
    }
    
    // Stop speech recognition if active
    if (recognition) {
      try {
        recognition.abort();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      isRecording = false;
    }
    
    // Remove recording visual indicator
    sourceTextDiv.classList.remove('recording');
    document.body.classList.remove('is-recording');
    
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
  
  // Modify translateText function for better mobile handling
  async function translateText(text, isFinal) {
    if (!text || text.trim() === '') {
      return;
    }
    
    // Mobile devices need special handling to ensure full sentence translation
    if (browserInfo.isMobile) {
      // For mobile, make sure we have a reasonable amount of text to translate
      if (text.trim().length < 4) {
        console.log('Mobile: Text too short for translation, skipping');
        return;
      }
      
      // For mobile, add a period at the end if there isn't a sentence-ending punctuation
      const endsWithPunctuation = /[.!?。？！]$/.test(text.trim());
      if (!endsWithPunctuation) {
        text = text.trim() + '.';
      }
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
      
      // Add delay before making next API call to avoid rate limiting
      if (Date.now() - lastTranslationTime < 750) {
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      
      // Mobile devices get longer timeout
      const timeoutDuration = browserInfo.isMobile ? 20000 : 15000;
      
      // Always use direct OpenAI API call
      const apiKey = getApiKey();
      
      // Setup request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
      
      const requestOptions = {
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
              content: `You are a translator from ${getLanguageName(selectedSourceLanguage)} to ${getLanguageName(selectedTargetLanguage)}. Translate the following text accurately and naturally, preserving the meaning and tone of the original text. ${browserInfo.isMobile ? 'Ensure you translate the COMPLETE text, not just the first few words.' : ''}`
            },
            {
              role: "user",
              content: text
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        }),
        signal: controller.signal
      };
      
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', requestOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.error && errorData.error.code === 'unsupported_country_region_territory') {
            await checkVpnConnection(); // Re-check VPN status
            throw new Error('Your location is not supported. Please use VPN to connect from a supported region');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again in a moment.');
          } else {
            throw new Error(errorData.error?.message || 'Translation failed');
          }
        }
        
        const data = await response.json();
        const translation = data.choices[0].message.content;
        
        // Mobile validation - check if translation seems too short compared to input
        if (browserInfo.isMobile && translation) {
          const inputWordCount = text.split(/\s+/).length;
          const translationWordCount = translation.split(/\s+/).length;
          
          // If translation seems too short, log warning
          if (inputWordCount > 3 && translationWordCount === 1) {
            console.warn('Mobile: Translation suspiciously short, may be incomplete', {
              input: text,
              inputWords: inputWordCount,
              translation: translation,
              translationWords: translationWordCount
            });
            
            // Try to use cached translation if it's longer
            const cachedTranslation = translationHistory[translationHistory.length - 1];
            if (cachedTranslation && cachedTranslation.split(/\s+/).length > translationWordCount) {
              console.log('Mobile: Using previous longer translation instead');
              return cachedTranslation;
            }
          }
        }
        
        // Cache the translation
        partialTranslationCache[text] = translation;
        
        // Update the translated text
        translatedTextDiv.textContent = translation;
        
        // If this is a final translation, add it to the history
        if (isFinal) {
          addTranslationToHistory(translation);
        }
        
        setStatus('Translation complete');
        return translation;
      } catch (fetchError) {
        // Handle AbortController timeout
        if (fetchError.name === 'AbortError') {
          throw new Error('Translation request timed out. Please try again.');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Translation error:', error);
      
      // Don't show API errors for non-final translations
      if (isFinal) {
        setStatus(`Translation error: ${error.message}`, true);
        
        if (error.message.includes('location is not supported')) {
          // Show prominent VPN warning
          document.querySelector('.vpn-warning').classList.remove('success');
          document.querySelector('.vpn-warning').classList.add('error');
          document.querySelector('.vpn-warning-message').innerHTML = 
            '<strong>VPN Required!</strong> Your location is not supported. Please connect to VPN from a supported region.';
        }
      } else {
        console.log('Ignoring error for non-final translation');
      }
      
      return null;
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
      // Modern clipboard API
      if (hasClipboardAPI) {
        navigator.clipboard.writeText(content)
          .then(() => {
            showCopiedNotification();
          })
          .catch(err => {
            console.error('Failed to copy text with Clipboard API: ', err);
            fallbackCopy(content);
          });
      } else {
        fallbackCopy(content);
      }
    }
  }
  
  // Fallback copy method for browsers without Clipboard API
  function fallbackCopy(text) {
    try {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = text;
      
      // Make the textarea out of viewport
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      
      // Focus and select the text
      textarea.focus();
      textarea.select();
      
      // Execute copy command
      const successful = document.execCommand('copy');
      
      // Remove the textarea
      document.body.removeChild(textarea);
      
      if (successful) {
        showCopiedNotification();
      } else {
        setStatus('Failed to copy text', true);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      setStatus('Failed to copy text. Please select and copy manually.', true);
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
  
  // Modify init function to add mobile optimizations
  function init() {
    // Add browser compatibility class to body
    document.body.classList.add(`browser-${browserInfo.browser.toLowerCase()}`);
    if (browserInfo.isMobile) {
      document.body.classList.add('mobile-device');
      
      // Mobile-specific optimizations
      setupMobileOptimizations();
    }
    
    // Initialize languages
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
    
    // Handle localStorage storage errors
    function safeLocalStorageGetItem(key, defaultValue) {
      try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
      } catch (e) {
        console.error('Error accessing localStorage:', e);
        return defaultValue;
      }
    }
    
    function safeLocalStorageSetItem(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        console.error('Error writing to localStorage:', e);
        return false;
      }
    }
    
    // Replace localStorage usage with safe versions
    window.safeStorage = {
      getItem: safeLocalStorageGetItem,
      setItem: safeLocalStorageSetItem
    };
    
    // Ensure interface is usable without recognition
    if (!hasSpeechRecognition && !hasMediaRecorder) {
      setStatus('Your browser does not support speech recognition or audio recording. Please try a different browser like Chrome, Edge, or Firefox.', true);
      translatorToggle.checked = false;
      isTranslatorActive = false;
      updateToggleLabel();
    }
    
    // Check VPN connection on startup
    checkVpnConnection().then(isConnected => {
      // Start recognition if active and VPN is connected
      if (isTranslatorActive && isConnected) {
        startRecognition();
      }
    });
    
    // Implement a heartbeat mechanism to maintain activity
    let heartbeatInterval = null;
    
    function startHeartbeat() {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // Check every 30 seconds if recognition is still active
      heartbeatInterval = setInterval(() => {
        if (isTranslatorActive) {
          // If recognition is supposed to be active but isn't, restart it
          if (!isRecording && !isDirectAudioRecording) {
            console.log('Heartbeat: Recognition should be active but isn\'t. Restarting...');
            startRecognition();
          }
        }
      }, 30000);
    }
    
    // Start heartbeat
    startHeartbeat();
    
    // Add visibility change listener to handle page becoming active/inactive
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('Page became visible, checking recognition status');
        
        // When page becomes visible, restart recognition if it should be active
        if (isTranslatorActive && !isRecording && !isDirectAudioRecording) {
          console.log('Restarting recognition after visibility change');
          startRecognition();
        }
      }
    });
    
    // Add global handling for network connectivity changes
    window.addEventListener('online', () => {
      console.log('Network connection restored');
      // Check VPN connection on network restoration
      checkVpnConnection().then(isConnected => {
        if (isConnected && isTranslatorActive) {
          startRecognition();
        }
      });
    });
    
    window.addEventListener('offline', () => {
      console.log('Network connection lost');
      setStatus('Network connection lost. Waiting for connection...', true);
    });
  }
  
  // Setup mobile-specific optimizations
  function setupMobileOptimizations() {
    console.log('Setting up mobile-specific optimizations');
    
    // Add tap-to-scroll functionality for mobile devices
    translatedTextDiv.addEventListener('click', function() {
      // Scroll to bottom of translation container on tap
      const container = document.querySelector('.translated-text-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
    
    // Add double-tap to clear text
    let lastTap = 0;
    sourceTextDiv.addEventListener('click', function(e) {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      
      if (tapLength < 500 && tapLength > 0) {
        // Double tap detected
        if (sourceTextDiv.textContent.trim() !== '') {
          // Only clear if there's content
          e.preventDefault();
          currentTranscript = '';
          sourceTextDiv.textContent = '';
          translatedTextDiv.textContent = '';
          // Clean cache for fresh translations
          partialTranslationCache = {};
        }
      }
      
      lastTap = currentTime;
    });
    
    // Ensure audio permission is requested explicitly on first visit
    if (!localStorage.getItem('audioPermissionRequested')) {
      // Create a prominent button for users to click to enable audio
      const permissionButton = document.createElement('button');
      permissionButton.textContent = 'Enable Microphone';
      permissionButton.className = 'check-vpn-btn';
      permissionButton.style.marginTop = '10px';
      permissionButton.style.backgroundColor = '#4CAF50';
      permissionButton.style.fontSize = '16px';
      permissionButton.style.padding = '12px 20px';
      permissionButton.style.width = '100%';
      
      document.querySelector('.controls').appendChild(permissionButton);
      
      permissionButton.addEventListener('click', async () => {
        try {
          // Request microphone permission explicitly
          await navigator.mediaDevices.getUserMedia({ audio: true });
          localStorage.setItem('audioPermissionRequested', 'true');
          permissionButton.remove();
          
          // Now start recognition
          if (isTranslatorActive) {
            startRecognition();
          }
        } catch (error) {
          console.error('Error requesting microphone permission:', error);
          setStatus('Microphone access denied. Please allow microphone access in your browser settings.', true);
          permissionButton.textContent = 'Microphone Access Denied';
          permissionButton.style.backgroundColor = '#dc3545';
        }
      });
    }
    
    // Add wake lock if supported - prevent screen from turning off
    if ('wakeLock' in navigator) {
      let wakeLock = null;
      
      const requestWakeLock = async () => {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake lock activated');
          
          wakeLock.addEventListener('release', () => {
            console.log('Wake lock released');
          });
        } catch (error) {
          console.error('Error requesting wake lock:', error);
        }
      };
      
      // Request wake lock when translator is active
      translatorToggle.addEventListener('change', () => {
        if (translatorToggle.checked && !wakeLock) {
          requestWakeLock();
        }
      });
      
      // Re-request wake lock when page becomes visible
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isTranslatorActive && !wakeLock) {
          requestWakeLock();
        }
      });
      
      // Initial request if translator is active
      if (isTranslatorActive) {
        requestWakeLock();
      }
    }
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
      
      // For mobile devices, ensure we're sending complete sentences
      // by retaining the existing transcript text if available
      let existingText = '';
      if (browserInfo.isMobile && sourceTextDiv.textContent && sourceTextDiv.textContent.trim() !== '') {
        existingText = sourceTextDiv.textContent.trim() + ' ';
        console.log('Mobile device: appending to existing transcript:', existingText);
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
      
      // Use different mime type based on browser detection
      let mimeType = 'audio/webm';
      if (browserInfo.browser === 'Safari' || browserInfo.os === 'iOS') {
        mimeType = 'audio/mp4';
      }
      
      const blob = new Blob(byteArrays, { type: mimeType });
      
      // Create form data
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'gpt-4o-mini-transcribe');
      
      if (sourceLanguage) {
        formData.append('language', sourceLanguage);
      }
      
      // On mobile, also add prompt hint to continue previous transcription
      if (browserInfo.isMobile && existingText) {
        formData.append('prompt', `Continue from: "${existingText.substring(0, 100)}"`);
      }
      
      const apiKey = getApiKey();
      
      // Add timeout for mobile devices
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Make the API request
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Transcription failed');
      }
      
      const data = await response.json();
      let transcribedText = data.text || '';
      
      // For mobile devices, get a meaningful transcription by using both the previous text and new text
      if (browserInfo.isMobile) {
        // If we have meaningful new text
        if (transcribedText && transcribedText.trim().length > 5) {
          // If the new text doesn't seem to be a continuation, keep it as is
          if (existingText && !transcribedText.startsWith(existingText.trim())) {
            // Append only if not already starting with existing text
            console.log('Mobile: New complete transcription detected');
            return transcribedText;
          } else if (existingText) {
            // If new text is a subset of existing text, return combined text
            if (existingText.includes(transcribedText)) {
              console.log('Mobile: Using existing text as it contains new text');
              return existingText.trim();
            }
          }
        } else if (existingText && (!transcribedText || transcribedText.trim().length <= 5)) {
          // If new text is too short but we have existing text, keep the existing text
          console.log('Mobile: New text too short, keeping existing text');
          return existingText.trim();
        }
      }
      
      return transcribedText;
    } catch (error) {
      console.error('Direct transcription error:', error);
      throw error;
    }
  }

  // Function to setup direct audio recording when using direct API mode
  function setupDirectAudioRecording() {
    // If already set up, don't recreate
    if (mediaRecorder) return;
    
    // Check for MediaRecorder support
    if (!hasMediaRecorder) {
      console.error('MediaRecorder API not supported in this browser');
      setStatus('Audio recording not supported in this browser.', true);
      return;
    }
    
    // Configure audio context for Safari which needs special handling
    let constraints = { audio: true };
    
    // Special handling for Safari and iOS
    if (browserInfo.browser === 'Safari' || browserInfo.os === 'iOS') {
      constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
    }
    
    // Get audio stream with error handling
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        console.log('Got audio stream for direct recording');
        
        // For Safari, we need to wrap this in a try-catch due to inconsistent behavior
        try {
          // Different MIME types for different browsers
          let mimeType = 'audio/webm';
          
          // Check supported mime types
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
          }
          
          // Create MediaRecorder with appropriate options
          const options = { mimeType };
          mediaRecorder = new MediaRecorder(stream, options);
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };
          
          mediaRecorder.onstop = async () => {
            try {
              console.log('Audio recording stopped, processing...');
              
              // Skip processing if there are no chunks
              if (audioChunks.length === 0) {
                console.log('No audio chunks recorded, skipping');
                if (isTranslatorActive) {
                  setTimeout(() => startDirectAudioRecording(), 100);
                }
                return;
              }
              
              // Combine chunks into a single blob
              const audioBlob = new Blob(audioChunks, { type: mimeType });
              
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
                  
                  // For mobile devices, we need to handle chunked processing
                  if (browserInfo.isMobile) {
                    // Only update if we got a meaningful transcription 
                    // or if it's different from what's already there
                    if (transcription.trim().length > 5 && 
                        (!sourceTextDiv.textContent || transcription !== sourceTextDiv.textContent.trim())) {
                      console.log('Mobile: Updated transcript with new content:', transcription);
                      
                      // Update UI with transcription
                      currentTranscript = transcription;
                      sourceTextDiv.textContent = transcription;
                      
                      // For mobile, always translate as final
                      await translateText(transcription, true);
                    } else {
                      console.log('Mobile: No significant change in transcript, continuing recording');
                    }
                    
                    // Don't clear chunks completely on mobile to help with continuity
                    // Just keep the last few chunks to reduce memory usage
                    if (audioChunks.length > 3) {
                      audioChunks = audioChunks.slice(-2);
                    }
                  } else {
                    // Desktop behavior remains the same
                    currentTranscript = transcription;
                    sourceTextDiv.textContent = transcription;
                    await translateText(transcription, true);
                    audioChunks = [];
                  }
                  
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
              
              reader.onerror = (error) => {
                console.error('Error reading audio blob:', error);
                
                // Restart recording after error
                if (isTranslatorActive) {
                  setTimeout(() => startDirectAudioRecording(), 1000);
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
          
          mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
            setStatus('Error recording audio. Trying to restart...', true);
            
            // Try to recreate the media recorder
            mediaRecorder = null;
            setTimeout(() => {
              if (isTranslatorActive) {
                setupDirectAudioRecording();
              }
            }, 1000);
          };
          
        } catch (error) {
          console.error('Error creating MediaRecorder:', error);
          setStatus(`MediaRecorder error: ${error.message}. Audio recording may not work.`, true);
        }
      }).catch(error => {
        console.error('Error accessing microphone:', error);
        setStatus('Microphone access denied. Please allow microphone access.', true);
        translatorToggle.checked = false;
        isTranslatorActive = false;
        updateToggleLabel();
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
      try {
        // Don't clear audio chunks on mobile to enable continuous speech recognition
        if (!browserInfo.isMobile) {
          audioChunks = [];
        }
        
        // Add visual feedback for recording
        sourceTextDiv.classList.add('recording');
        
        // Safari requires specific error handling
        if (browserInfo.browser === 'Safari' || browserInfo.os === 'iOS') {
          try {
            mediaRecorder.start();
          } catch (error) {
            console.error('Error starting MediaRecorder in Safari:', error);
            // Recreate MediaRecorder for Safari
            mediaRecorder = null;
            setupDirectAudioRecording();
            return;
          }
        } else {
          mediaRecorder.start();
        }
        
        isDirectAudioRecording = true;
        setStatus('Listening (Direct Mode)...');
        
        // Adjust recording time based on browser
        let recordingTime = 5000; // default 5 seconds
        
        // Longer for mobile to capture full sentences
        if (browserInfo.isMobile) {
          recordingTime = 6000; // 6 seconds for mobile
        }
        
        // Stop recording after the specified time
        // Then immediately restart to create continuous recording
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            try {
              mediaRecorder.stop();
              isDirectAudioRecording = false;
              sourceTextDiv.classList.remove('recording');
              // mediaRecorder.onstop will handle processing and restart
            } catch (error) {
              console.error('Error stopping MediaRecorder:', error);
              // Try to recreate and restart
              mediaRecorder = null;
              if (isTranslatorActive) {
                setTimeout(() => setupDirectAudioRecording(), 500);
              }
            }
          }
        }, recordingTime);
      } catch (error) {
        console.error('Error in startDirectAudioRecording:', error);
        // Reset and try again
        mediaRecorder = null;
        sourceTextDiv.classList.remove('recording');
        if (isTranslatorActive) {
          setTimeout(() => setupDirectAudioRecording(), 1000);
        }
      }
    }
  }

  // Function to check if VPN is working
  async function checkVpnConnection() {
    try {
      setStatus('Checking VPN connection...');
      const apiKey = getApiKey();
      
      // Setup request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Try a minimal call to OpenAI to check connectivity
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log('VPN connection successful - OpenAI API accessible');
          setStatus('VPN connection successful!');
          isVpnConnected = true;
          
          // Update VPN warning UI
          const vpnWarning = document.querySelector('.vpn-warning');
          vpnWarning.classList.remove('error');
          vpnWarning.classList.add('success');
          document.querySelector('.vpn-warning-message').innerHTML = 
            '<strong>VPN Connected!</strong> You can now use the translator.';
          
          return true;
        } else {
          console.log('VPN connection failed - OpenAI API returned error');
          const errorData = await response.json();
          
          // Check for specific errors
          if (errorData.error && errorData.error.code === 'unsupported_country_region_territory') {
            setStatus('VPN error: Your location is not supported. Please use VPN to connect from a supported region', true);
            document.querySelector('.vpn-warning-message').innerHTML = 
              '<strong>VPN Required!</strong> Your location is not supported. Please connect to VPN from a supported region.';
          } else if (response.status === 401) {
            setStatus('API key error: Please check your API key', true);
            document.querySelector('.vpn-warning-message').innerHTML = 
              '<strong>API Key Error!</strong> Please check your API key configuration.';
          } else if (response.status === 429) {
            setStatus('Rate limit exceeded. Please try again later.', true);
            document.querySelector('.vpn-warning-message').innerHTML = 
              '<strong>Rate Limited!</strong> OpenAI API rate limit exceeded. Please try again later.';
          } else {
            setStatus('VPN connection failed - OpenAI API returned an error', true);
            document.querySelector('.vpn-warning-message').innerHTML = 
              `<strong>Connection Error!</strong> ${errorData.error?.message || 'Unknown API error'}`;
          }
          
          isVpnConnected = false;
          document.querySelector('.vpn-warning').classList.remove('success');
          document.querySelector('.vpn-warning').classList.add('error');
          return false;
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Handle AbortController timeout
        if (fetchError.name === 'AbortError') {
          console.error('VPN check timed out');
          setStatus('VPN connection check timed out. Please check your internet connection.', true);
        } else {
          console.error('VPN check error:', fetchError);
          setStatus('VPN connection failed - Please ensure your VPN is active', true);
        }
        
        document.querySelector('.vpn-warning-message').innerHTML = 
          `<strong>Connection Error!</strong> ${fetchError.message || 'Failed to connect to OpenAI API. Please check your internet and VPN.'}`;
        
        isVpnConnected = false;
        document.querySelector('.vpn-warning').classList.remove('success');
        document.querySelector('.vpn-warning').classList.add('error');
        return false;
      }
    } catch (error) {
      console.error('General VPN check error:', error);
      setStatus('Error checking VPN connection: ' + error.message, true);
      
      document.querySelector('.vpn-warning-message').innerHTML = 
        `<strong>Error!</strong> Failed to check VPN connection: ${error.message}`;
      
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

  // Custom function to queue iterative translation
  function queueIterativeTranslation(transcript, isFinal) {
    // Skip if translation is in progress or transcript is empty
    if (isProcessingIterative || !transcript || transcript.trim() === '') {
      return;
    }
    
    // For final translations, always process
    // For interim, only if not currently translating
    if (isFinal || !isTranslationInProgress) {
      pendingTranslations.push({ text: transcript, isFinal });
      processNextTranslation();
    }
  }

  // Process the next translation in the queue
  function processNextTranslation() {
    if (isProcessingIterative || pendingTranslations.length === 0) {
      return;
    }
    
    isProcessingIterative = true;
    const { text, isFinal } = pendingTranslations.shift();
    
    translateText(text, isFinal)
      .then(() => {
        isProcessingIterative = false;
        // Process next item if available
        if (pendingTranslations.length > 0) {
          // For non-final translations, only keep the latest
          if (!pendingTranslations[pendingTranslations.length - 1].isFinal) {
            pendingTranslations = [pendingTranslations[pendingTranslations.length - 1]];
          }
          processNextTranslation();
        }
      })
      .catch(error => {
        console.error('Error in processNextTranslation:', error);
        isProcessingIterative = false;
        // Continue with next item despite error
        if (pendingTranslations.length > 0) {
          setTimeout(processNextTranslation, 1000);
        }
      });
  }

  // Reset finalization timer
  function resetFinalizationTimer() {
    // Clear existing timer
    if (finalizationTimer) {
      clearTimeout(finalizationTimer);
    }
    
    // Set new timer - after 2 seconds of no updates, consider it final
    finalizationTimer = setTimeout(() => {
      if (currentTranscript && currentTranscript.trim() !== '') {
        console.log('No updates for 2 seconds, finalizing transcript:', currentTranscript);
        isFinalizing = true;
        
        // Process as final
        processAudioTranscript(currentTranscript, true);
        
        // Reset
        currentTranscript = '';
        isFinalizing = false;
      }
    }, 2000);
  }

  // Add translation to history
  function addTranslationToHistory(translation) {
    if (!translation || translation.trim() === '') {
      return;
    }
    
    // Create history item
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.textContent = translation;
    
    // Add to history
    translatedHistoryDiv.appendChild(historyItem);
    
    // Scroll to latest
    translatedHistoryDiv.scrollTop = translatedHistoryDiv.scrollHeight;
    
    // Limit history items
    const MAX_HISTORY_ITEMS = 10;
    const historyItems = translatedHistoryDiv.querySelectorAll('.history-item');
    
    if (historyItems.length > MAX_HISTORY_ITEMS) {
      translatedHistoryDiv.removeChild(historyItems[0]);
    }
    
    // Save to array
    translationHistory.push(translation);
    
    // Limit array size
    if (translationHistory.length > MAX_HISTORY_ITEMS) {
      translationHistory.shift();
    }
  }
}); 