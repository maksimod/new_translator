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
      
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        if (audioChunks.length === 0 || audioChunks.every(chunk => chunk.size === 0)) {
          setStatus('No audio data recorded. Please try again.', true);
          resetRecordingState();
          return;
        }
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        if (audioBlob.size < 100) {
          setStatus('Audio recording too short or empty. Please try again.', true);
          resetRecordingState();
          return;
        }
        
        try {
          await transcribeAudio(audioBlob);
        } catch (error) {
          setStatus(`Error processing audio: ${error.message}`, true);
          resetRecordingState();
        }
      };
      
      setStatus('Microphone access granted');
    } catch (error) {
      setStatus(`Microphone access denied: ${error.message}`, true);
      recordButton.disabled = true;
    }
  }
  
  function resetRecordingState() {
    recordButton.classList.remove('recording');
    recordButtonText.textContent = 'Start Recording';
    isRecording = false;
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
      mediaRecorder.start(1000); // Collect data every second
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
      
      const base64Promise = new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
      });
      
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;
      
      setStatus('Sending audio for transcription...');
      
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
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Transcription failed: ${response.status}`);
      }
      
      if (!data.text || data.text.trim() === '') {
        setStatus('No speech detected. Please try again.', true);
        return;
      }
      
      // Display transcribed text
      sourceTextDiv.textContent = data.text;
      setStatus('Transcription complete, translating...');
      
      // Translate the transcribed text
      await translateText(data.text);
    } catch (error) {
      console.error('Transcription error:', error);
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
      setStatus('Microphone not initialized. Please refresh the page and allow microphone access.', true);
      return;
    }
    
    toggleRecording();
  });
  
  // Initialize the application
  fetchLanguages();
  setupMediaRecorder();
}); 