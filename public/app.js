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
  let lastFinalizedTranscript = ''; // Track last finalized transcript to avoid duplicates
  let processingFinalTranscript = false; // Flag to prevent concurrent processing
  
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

  // Check browser support for Web Speech API
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    setStatus('Your browser does not support speech recognition. Please use Chrome or Edge.', true);
    translatorToggle.disabled = true;
    return;
  }

  // Check authentication status before initializing
  checkAuthenticationStatus()
    .then(isAuthenticated => {
      if (!isAuthenticated) {
        window.location.href = '/auth';
        return;
      }
      
      // Initialize application
      initializeApp();
    })
    .catch(error => {
      console.error('Error checking authentication:', error);
      window.location.href = '/auth';
    });
    
  // Function to check authentication status
  async function checkAuthenticationStatus() {
    try {
      const response = await fetch('/api/languages');
      if (response.status === 401) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('Authentication check error:', error);
      return false;
    }
  }
  
  // Initialize the application after authentication check
  function initializeApp() {
    // Fetch languages from the API
    fetchLanguages();
    
    // Fetch languages from the API
    async function fetchLanguages() {
      try {
        const response = await fetch('/api/languages');
        
        // If unauthorized, redirect to auth page
        if (response.status === 401) {
          window.location.href = '/auth';
          return;
        }
        
        languages = await response.json();
        
        // Populate language dropdowns
        populateLanguageDropdowns();
        
        // Set default language selections
        sourceLanguageSelect.value = selectedSourceLanguage;
        targetLanguageSelect.value = selectedTargetLanguage;
      } catch (error) {
        setStatus(`Error fetching languages: ${error.message}`, true);
      }
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup speech recognition
    setupSpeechRecognition();
    
    // Start recognition if translator is active
    if (isTranslatorActive) {
      startRecognition();
    }
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Language selection changes
    sourceLanguageSelect.addEventListener('change', (e) => {
      selectedSourceLanguage = e.target.value;
      updateRecognitionLanguage();
      
      // Reset translation cache and history
      clearTranslationStates();
    });
    
    targetLanguageSelect.addEventListener('change', (e) => {
      selectedTargetLanguage = e.target.value;
      
      // Reset translation cache and history
      clearTranslationStates();
    });
    
    // Switch languages button
    switchLanguagesBtn.addEventListener('click', () => {
      const tempLang = selectedSourceLanguage;
      selectedSourceLanguage = selectedTargetLanguage;
      selectedTargetLanguage = tempLang;
      
      sourceLanguageSelect.value = selectedSourceLanguage;
      targetLanguageSelect.value = selectedTargetLanguage;
      
      updateRecognitionLanguage();
      
      // Reset translation cache and history
      clearTranslationStates();
    });
    
    // Translator toggle
    translatorToggle.addEventListener('change', () => {
      isTranslatorActive = translatorToggle.checked;
      updateToggleLabel();
      
      if (isTranslatorActive) {
        startRecognition();
      } else {
        stopRecognition();
      }
    });
    
    // Copy button
    copyButton.addEventListener('click', copyTranslations);
  }
  
  // Function to clear translation states
  function clearTranslationStates() {
    // Clear text areas
    sourceTextDiv.textContent = '';
    translatedTextDiv.textContent = '';
    
    // Clear transcript variables
    currentTranscript = '';
    lastProcessedTranscript = '';
    lastFinalizedTranscript = '';
    
    // Clear translation cache
    partialTranslationCache = {};
    
    // Reset processing flags
    isFinalizing = false;
    processingFinalTranscript = false;
    isTranslationInProgress = false;
    
    if (finalizationTimer) {
      clearTimeout(finalizationTimer);
      finalizationTimer = null;
    }
    
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
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
    
    recognition.onnomatch = () => {
      console.log('No speech detected');
    };
    
    recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      
      // Get the transcript from the results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript = event.results[i][0].transcript;
        isFinal = event.results[i].isFinal;
        
        if (isFinal) {
          currentTranscript = transcript; // Store final result
          console.debug('Final transcript:', transcript);
          
          // Start a finalization timer to detect end of speech
          if (!isFinalizing) {
            startFinalizationTimer();
          }
        } else {
          console.debug('Interim transcript:', transcript);
          // Reset finalization if we're still getting interim results
          if (isFinalizing) {
            resetFinalizationTimer();
          }
        }
      }
      
      if (transcript.trim() !== '') {
        // Check if the detected language matches the selected source language
        checkLanguageAndProcess(transcript, isFinal);
      }
    };
    
    // Start warm-up recognition
    function startWarmUp() {
      try {
        console.log('Starting warm-up recognition...');
        warmupRecognition.start();
      } catch (error) {
        console.error('Warm-up start error:', error);
        // Start real recognition if warm-up fails
        if (!hasStartedRealRecognition) {
          hasStartedRealRecognition = true;
          startRealRecognition();
        }
      }
    }
    
    // Start the real recognition
    function startRealRecognition() {
      if (!isRecording && isTranslatorActive) {
        try {
          recognition.start();
        } catch (error) {
          console.error('Recognition start error:', error);
          // If already started, retry after a short delay
          setTimeout(() => {
            if (!isRecording && isTranslatorActive) {
              try {
                recognition.start();
              } catch (innerError) {
                console.error('Second attempt failed:', innerError);
              }
            }
          }, 300);
        }
      }
    }
    
    // Store the function in the outer scope for access from other functions
    this.startRealRecognition = startRealRecognition;
    
    // Begin with warm-up
    startWarmUp();
  }
  
  // Start a timer to detect end of speech/phrase
  function startFinalizationTimer() {
    isFinalizing = true;
    console.debug('Starting finalization timer');
    
    if (finalizationTimer) {
      clearTimeout(finalizationTimer);
    }
    
    finalizationTimer = setTimeout(() => {
      console.debug('Finalization timer completed, finalizing current phrase');
      finalizeCurrentPhrase();
    }, 800); // Wait 800ms of silence to finalize (reduced from 2000ms for faster response)
  }
  
  // Reset finalization timer if speech continues
  function resetFinalizationTimer() {
    isFinalizing = false;
    console.debug('Resetting finalization timer');
    
    if (finalizationTimer) {
      clearTimeout(finalizationTimer);
      finalizationTimer = null;
    }
  }
  
  // Finalize the current phrase and prepare for a new one
  function finalizeCurrentPhrase() {
    const currentTranslation = translatedTextDiv.textContent.trim();
    if (currentTranslation !== '') {
      console.debug('Finalizing phrase:', currentTranslation);
      
      // Store the current transcript to prevent duplicates
      lastFinalizedTranscript = currentTranscript || lastProcessedTranscript;
      
      // Add current translation to history only if not already in history
      const isDuplicate = translationHistory.includes(currentTranslation);
      if (!isDuplicate) {
        addTranslationToHistory(currentTranslation);
      }
      
      // Clear current translation area for new phrase
      translatedTextDiv.textContent = '';
      sourceTextDiv.textContent = '';
      
      // Reset processed transcript
      lastProcessedTranscript = '';
      
      // Reset finalization state
      isFinalizing = false;
      finalizationTimer = null;
    }
  }
  
  // Add translation to history
  function addTranslationToHistory(translation) {
    // Don't add empty translations
    if (!translation || translation.trim() === '') {
      return;
    }
    
    // Check if this translation already exists in history
    if (translationHistory.includes(translation)) {
      console.debug('Translation already in history, skipping');
      return;
    }
    
    // Add to array for copy functionality
    translationHistory.push(translation);
    
    // Create history item element
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.textContent = translation;
    
    // Add to DOM
    translatedHistoryDiv.appendChild(historyItem);
    
    // Scroll to the bottom to show latest translation
    const container = translatedHistoryDiv.parentElement;
    container.scrollTop = container.scrollHeight;
  }
  
  function startRecognition() {
    if (hasStartedRealRecognition) {
      startRealRecognition();
    } else {
      // If real recognition hasn't started yet (still in warm-up),
      // just set the flag and it will start automatically after warm-up
      isTranslatorActive = true;
    }
  }
  
  function stopRecognition() {
    if (isRecording) {
      try {
        recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
    }
  }
  
  function updateRecognitionLanguage() {
    if (recognition) {
      const browserLanguageCode = languageCodeMapping[selectedSourceLanguage] || selectedSourceLanguage;
      recognition.lang = browserLanguageCode;
      console.log(`Recognition language set to: ${browserLanguageCode}`);
      
      // Reset translation cache when language changes
      partialTranslationCache = {};
    }
  }
  
  // Check if we need to process the transcript based on changes
  function shouldProcessTranscript(transcript) {
    const now = Date.now();
    const timeSinceLastTranslation = now - lastTranslationTime;
    
    // Count words in current and last processed transcript
    const currentWords = transcript.trim().split(/\s+/);
    const lastWords = lastProcessedTranscript.trim().split(/\s+/);
    
    // How many new words (rough estimation)
    let wordDifference = currentWords.length - lastWords.length;
    
    // Log details for debugging
    console.debug('Transcript analysis:', {
      current: transcript,
      last: lastProcessedTranscript,
      currentWordCount: currentWords.length,
      lastWordCount: lastWords.length,
      wordDifference: wordDifference,
      timeSinceLastTranslation: timeSinceLastTranslation,
      isTranslationInProgress: isTranslationInProgress
    });
    
    // Process if:
    // 1. It's a new phrase (first few words)
    // 2. At least 2 new words detected (reduced from 3 for faster response)
    // 3. Time since last translation > 500ms (reduced from 1000ms for faster response)
    // 4. No translation is currently in progress
    
    if (lastProcessedTranscript === '' || 
        wordDifference >= 2 || 
        timeSinceLastTranslation > 500) {
      
      if (!isTranslationInProgress) {
        console.debug('Should process transcript: YES - criteria met');
        return true;
      } else {
        console.debug('Should process transcript: NO - translation in progress');
        return false;
      }
    }
    
    console.debug('Should process transcript: NO - criteria not met');
    return false;
  }
  
  // Check if the detected language matches the selected source language
  async function checkLanguageAndProcess(transcript, isFinal) {
    lastTranscriptTime = Date.now();
    
    // Clear any existing timers
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
    
    // Display transcript in source text area
    sourceTextDiv.textContent = transcript;
    
    // If final result or significant changes, and translator is active, process for translation
    if (isFinal && isTranslatorActive) {
      // Process immediately for better responsiveness
      console.debug('Processing FINAL transcript immediately');
      await processAudioTranscript(transcript, true);
    } else if (!isFinal && shouldProcessTranscript(transcript)) {
      // Process partial transcript if there are significant changes
      console.debug('Processing PARTIAL transcript due to significant changes');
      await processAudioTranscript(transcript, false);
    } else if (!isFinal) {
      // Set a timer to process after a period of silence
      silenceTimer = setTimeout(async () => {
        if (Date.now() - lastTranscriptTime >= 400) { // Reduced from 800ms to 400ms for faster response
          // No new transcription for 400ms, treat as complete
          console.debug('Processing transcript after silence period');
          await processAudioTranscript(transcript, false);
        }
      }, 400); // Reduced from 800ms to 400ms for faster response
    }
  }
  
  // Process transcript and send for translation
  async function processAudioTranscript(transcript, isFinal) {
    if (!transcript || transcript.trim() === '') return;
    if (!isTranslatorActive) return;
    
    try {
      console.log(`Processing transcript: "${transcript}", isFinal: ${isFinal}`);
      
      // Update source text display
      sourceTextDiv.textContent = transcript;
      
      // Update last processed transcript
      lastProcessedTranscript = transcript;
      
      // If we already finalized this transcript, skip processing
      if (lastFinalizedTranscript === transcript) {
        console.debug('Skipping already finalized transcript');
        return;
      }
      
      // Translate the transcript
      const translation = await translateText(transcript, isFinal);
      
      if (translation) {
        // Only update display if this isn't a duplicate of something already in history
        if (!translationHistory.includes(translation)) {
          translatedTextDiv.textContent = translation;
          
          // If it's a final transcript, only add to history if we're not already processing a final transcript
          if (isFinal && !processingFinalTranscript) {
            processingFinalTranscript = true;
            // Store the current transcript to prevent duplicates
            lastFinalizedTranscript = transcript;
            
            // Add to history
            addTranslationToHistory(translation);
            
            // Clear the translation area after adding to history
            translatedTextDiv.textContent = '';
            
            setTimeout(() => {
              processingFinalTranscript = false;
            }, 500);
          }
        } else {
          console.debug('Skipping duplicate translation already in history');
          // Clear the translation area for duplicates
          translatedTextDiv.textContent = '';
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      setStatus('Error processing audio: ' + error.message, true);
      
      // Check if this is an authentication error
      if (error.message === 'Authentication required') {
        window.location.href = '/auth';
        return;
      }
    }
  }

  // Translate text using OpenAI API
  async function translateText(text, isFinal) {
    if (!text || text.trim() === '') {
      return null;
    }
    
    // Check if this is a duplicate of the last finalized transcript
    if (text === lastFinalizedTranscript && !isFinal) {
      console.debug('Skipping translation - duplicate of finalized transcript');
      return null;
    }
    
    // Check if we already have this exact text cached
    const cacheKey = `${selectedSourceLanguage}-${selectedTargetLanguage}-${text}`;
    if (partialTranslationCache[cacheKey]) {
      console.debug('Using cached translation:', partialTranslationCache[cacheKey]);
      return partialTranslationCache[cacheKey];
    }
    
    try {
      // Mark translation as in progress
      isTranslationInProgress = true;
      lastTranslationTime = Date.now();
      
      setStatus(isFinal ? 'Translating final text...' : 'Translating...');
      console.debug(`Sending ${isFinal ? 'FINAL' : 'PARTIAL'} text for translation:`, text);
      
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          sourceLanguage: selectedSourceLanguage,
          targetLanguage: selectedTargetLanguage
        })
      });
      
      // Check for authentication error
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Translation failed');
      }
      
      const data = await response.json();
      
      // Cache the translation for reuse
      partialTranslationCache[cacheKey] = data.translation;
      
      // Log completion
      console.debug(`Translation complete (${isFinal ? 'final' : 'partial'}):`, data.translation);
      
      setStatus(isFinal ? 'Translation complete' : 'Partial translation complete');
      
      return data.translation;
    } catch (error) {
      console.error('Translation error:', error);
      
      // Check if this is an authentication error
      if (error.message === 'Authentication required') {
        window.location.href = '/auth';
        return null;
      }
      
      setStatus(`Translation error: ${error.message}`, true);
      return null;
    } finally {
      // Mark translation as completed
      isTranslationInProgress = false;
    }
  }

  // Set status message
  function setStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.style.color = isError ? '#ea4335' : '#666';
    console.log(`Status: ${message} ${isError ? '(ERROR)' : ''}`);
  }
  
  // Update toggle label based on state
  function updateToggleLabel() {
    toggleLabel.textContent = isTranslatorActive ? 'Translator Active' : 'Translator Inactive';
  }
  
  // Copy all translations to clipboard
  function copyTranslations() {
    // Get all translations including current one if it exists
    let allTranslations = [...translationHistory];
    
    // Add current translation if not empty
    if (translatedTextDiv.textContent.trim() !== '') {
      allTranslations.push(translatedTextDiv.textContent);
    }
    
    // Join with newlines
    const textToCopy = allTranslations.join('\n\n');
    
    // Copy to clipboard
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        console.debug('Text copied to clipboard');
        showCopiedNotification();
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        setStatus('Failed to copy translations to clipboard', true);
      });
  }
  
  // Show a notification that text was copied
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
}); 