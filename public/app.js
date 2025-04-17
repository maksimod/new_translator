document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const switchLanguagesBtn = document.getElementById('switchLanguages');
  const translatorToggle = document.getElementById('translatorToggle');
  const toggleLabel = document.querySelector('.toggle-label');
  const sourceTextDiv = document.getElementById('sourceText');
  const translatedTextDiv = document.getElementById('translatedText');
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

  // Fetch languages from the API
  async function fetchLanguages() {
    try {
      const response = await fetch('/api/languages');
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
    recognition = new SpeechRecognition();
    
    // Set recognition properties
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // Set the language based on the selected source language
    updateRecognitionLanguage();
    
    // Recognition events
    recognition.onstart = () => {
      isRecording = true;
      setStatus('Listening...');
    };
    
    recognition.onend = () => {
      isRecording = false;
      if (isTranslatorActive) {
        // Restart recognition after a short delay
        setTimeout(() => {
          if (isTranslatorActive) {
            startRecognition();
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
      } else {
        setStatus(`Recognition error: ${event.error}`, true);
        // Restart after error if still active
        if (isTranslatorActive && !isRecording) {
          setTimeout(startRecognition, 1000);
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
      }
      
      if (transcript.trim() !== '') {
        // Check if the detected language matches the selected source language
        checkLanguageAndProcess(transcript, isFinal);
      }
    };
    
    // Start recognition
    if (isTranslatorActive) {
      startRecognition();
    }
  }
  
  function startRecognition() {
    if (!isRecording && isTranslatorActive) {
      try {
        recognition.start();
      } catch (error) {
        console.error('Recognition start error:', error);
        // If already started, do nothing
      }
    }
  }
  
  function stopRecognition() {
    if (isRecording) {
      recognition.stop();
    }
  }
  
  function updateRecognitionLanguage() {
    if (recognition) {
      const browserLanguageCode = languageCodeMapping[selectedSourceLanguage] || selectedSourceLanguage;
      recognition.lang = browserLanguageCode;
      console.log(`Recognition language set to: ${browserLanguageCode}`);
    }
  }
  
  // Check if the detected language matches the selected source language
  // For now, we'll use a simple approach by sending the first few words to the server for processing
  async function checkLanguageAndProcess(transcript, isFinal) {
    lastTranscriptTime = Date.now();
    
    // Clear any existing timers
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
    
    // Display transcript in source text area
    sourceTextDiv.textContent = transcript;
    
    // If final result and translator is active, process for translation
    if (isFinal && isTranslatorActive) {
      // Send to backend for transcription with language validation
      await processAudioTranscript(transcript);
    } else if (!isFinal) {
      // Set a timer to process after a period of silence
      silenceTimer = setTimeout(async () => {
        if (Date.now() - lastTranscriptTime >= 1500) {
          // No new transcription for 1.5 seconds, treat as complete
          await processAudioTranscript(transcript);
        }
      }, 1500);
    }
  }
  
  // Process transcript and send for translation if language matches
  async function processAudioTranscript(transcript) {
    if (!transcript || transcript.trim() === '') return;
    
    try {
      // Send the transcript for translation
      await translateText(transcript);
    } catch (error) {
      console.error('Error processing transcript:', error);
      setStatus(`Error: ${error.message}`, true);
    }
  }

  // Translate text using OpenAI API
  async function translateText(text) {
    if (!isTranslatorActive) return;
    
    try {
      setStatus('Translating...');
      
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          sourceLanguage: selectedSourceLanguage,
          targetLanguage: selectedTargetLanguage
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Translation failed: ${response.status}`);
      }
      
      // Display translated text
      translatedTextDiv.textContent = data.translation;
      
      setStatus('Translation complete');
    } catch (error) {
      console.error('Translation error:', error);
      setStatus(`Translation error: ${error.message}`, true);
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

  // Event listeners
  sourceLanguageSelect.addEventListener('change', () => {
    selectedSourceLanguage = sourceLanguageSelect.value;
    updateRecognitionLanguage();
    
    // Clear texts when language changes
    sourceTextDiv.textContent = '';
    translatedTextDiv.textContent = '';
  });
  
  targetLanguageSelect.addEventListener('change', () => {
    selectedTargetLanguage = targetLanguageSelect.value;
    
    // Clear translated text when target language changes
    translatedTextDiv.textContent = '';
  });
  
  switchLanguagesBtn.addEventListener('click', () => {
    // Swap language selections
    const tempLang = selectedSourceLanguage;
    selectedSourceLanguage = selectedTargetLanguage;
    selectedTargetLanguage = tempLang;
    
    // Update dropdowns
    sourceLanguageSelect.value = selectedSourceLanguage;
    targetLanguageSelect.value = selectedTargetLanguage;
    
    // Update recognition language
    updateRecognitionLanguage();
    
    // Clear text displays
    sourceTextDiv.textContent = '';
    translatedTextDiv.textContent = '';
  });
  
  translatorToggle.addEventListener('change', () => {
    isTranslatorActive = translatorToggle.checked;
    updateToggleLabel();
    
    if (isTranslatorActive) {
      setStatus('Translator activated. Listening...');
      startRecognition();
    } else {
      setStatus('Translator deactivated.');
      stopRecognition();
    }
  });
  
  // Initialize the application
  fetchLanguages();
  setupSpeechRecognition();
}); 