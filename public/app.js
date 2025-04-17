document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const switchLanguagesBtn = document.getElementById('switchLanguages');
  const recordButton = document.getElementById('recordButton');
  const recordButtonText = document.getElementById('recordButtonText');
  const sourceTextDiv = document.getElementById('sourceText');
  const translatedTextDiv = document.getElementById('translatedText');
  const statusElement = document.getElementById('status');

  // State variables
  let languages = [];
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let selectedSourceLanguage = 'ru'; // Default to Russian
  let selectedTargetLanguage = 'en'; // Default to English

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

  // Initialize media recorder
  async function setupMediaRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };
      
      setStatus('Microphone access granted');
    } catch (error) {
      setStatus(`Microphone access denied: ${error.message}`, true);
    }
  }

  // Toggle recording state
  function toggleRecording() {
    if (isRecording) {
      // Stop recording
      mediaRecorder.stop();
      recordButton.classList.remove('recording');
      recordButtonText.textContent = 'Start Recording';
      isRecording = false;
      setStatus('Processing speech...');
    } else {
      // Start recording
      audioChunks = [];
      mediaRecorder.start();
      recordButton.classList.add('recording');
      recordButtonText.textContent = 'Stop Recording';
      isRecording = true;
      setStatus('Recording... Speak now');
      
      // Clear previous texts
      sourceTextDiv.textContent = '';
      translatedTextDiv.textContent = '';
    }
  }

  // Transcribe audio using OpenAI API
  async function transcribeAudio(audioBlob) {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = reader.result;
        
        // Send to server for transcription
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            audioData: base64Audio,
            sourceLanguage: selectedSourceLanguage
          })
        });
        
        if (!response.ok) {
          throw new Error(`Transcription failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Display transcribed text
        sourceTextDiv.textContent = data.text;
        
        // Translate the transcribed text
        await translateText(data.text);
      };
    } catch (error) {
      setStatus(`Transcription error: ${error.message}`, true);
    }
  }

  // Translate text using OpenAI API
  async function translateText(text) {
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
      
      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Display translated text
      translatedTextDiv.textContent = data.translation;
      
      setStatus('Translation complete');
    } catch (error) {
      setStatus(`Translation error: ${error.message}`, true);
    }
  }

  // Set status message
  function setStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.style.color = isError ? '#ea4335' : '#666';
  }

  // Event listeners
  sourceLanguageSelect.addEventListener('change', () => {
    selectedSourceLanguage = sourceLanguageSelect.value;
  });
  
  targetLanguageSelect.addEventListener('change', () => {
    selectedTargetLanguage = targetLanguageSelect.value;
  });
  
  switchLanguagesBtn.addEventListener('click', () => {
    // Swap language selections
    const tempLang = selectedSourceLanguage;
    selectedSourceLanguage = selectedTargetLanguage;
    selectedTargetLanguage = tempLang;
    
    // Update dropdowns
    sourceLanguageSelect.value = selectedSourceLanguage;
    targetLanguageSelect.value = selectedTargetLanguage;
    
    // Clear text displays
    sourceTextDiv.textContent = '';
    translatedTextDiv.textContent = '';
  });
  
  recordButton.addEventListener('click', () => {
    if (!mediaRecorder) {
      setStatus('Microphone not initialized. Please refresh the page.', true);
      return;
    }
    
    toggleRecording();
  });
  
  // Initialize the application
  fetchLanguages();
  setupMediaRecorder();
}); 