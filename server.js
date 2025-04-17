require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Languages supported by the application
const languages = [
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

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('Created temp directory:', tempDir);
}

// API endpoint to get supported languages
app.get('/api/languages', (req, res) => {
  res.json(languages);
});

// API endpoint for transcription
app.post('/api/transcribe', async (req, res) => {
  let tempFilePath = null;
  
  try {
    const { audioData, sourceLanguage } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }
    
    console.log('Audio data received, processing...');
    console.log('Source language:', sourceLanguage);
    
    // Check if API key is valid
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
      console.error('OpenAI API key is missing or empty');
      return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }

    try {
      // Extract the base64 data
      let base64Data = audioData;
      
      // Handle data URLs (e.g. "data:audio/webm;base64,...")
      if (base64Data.includes('base64,')) {
        base64Data = base64Data.split('base64,')[1];
      }
      
      // Generate a unique filename
      const uniqueId = crypto.randomBytes(16).toString('hex');
      tempFilePath = path.join(tempDir, `audio_${uniqueId}.webm`);
      
      // Write the buffer to a temporary file
      const buffer = Buffer.from(base64Data, 'base64');
      console.log('Audio buffer size:', buffer.length, 'bytes');
      
      fs.writeFileSync(tempFilePath, buffer);
      console.log('Temporary file written:', tempFilePath);
      
      const fileSize = fs.statSync(tempFilePath).size;
      console.log('File size:', fileSize, 'bytes');
      
      if (fileSize === 0) {
        throw new Error('Audio file is empty');
      }
      
      // Create a file object from the temporary file
      const file = fs.createReadStream(tempFilePath);
      
      // Transcribe the audio using gpt-4o-mini-transcribe instead of whisper-1
      console.log('Starting transcription with gpt-4o-mini-transcribe...');
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "gpt-4o-mini-transcribe",
        language: sourceLanguage
      });
      
      console.log('Transcription successful:', transcription.text);
      
      // Delete the temporary file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log('Temporary file deleted');
      }
      
      // Return the transcription
      res.json({ text: transcription.text || '' });
    } catch (error) {
      console.error('Error during transcription:', error);
      
      // Clean up the temporary file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log('Temporary file deleted after error');
        } catch (unlinkError) {
          console.error('Error deleting temporary file:', unlinkError);
        }
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Transcription error:', error);
    
    // Provide specific error message
    let errorMessage = error.message;
    
    if (error.message.includes('Incorrect API key')) {
      errorMessage = 'Invalid OpenAI API key';
    } else if (error.message.includes('insufficient_quota')) {
      errorMessage = 'OpenAI API quota exceeded';
    } else if (error.message.includes('Rate limit')) {
      errorMessage = 'OpenAI API rate limit exceeded. Please try again later.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// API endpoint for translation
app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLanguage, targetLanguage } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const sourceLang = languages.find(lang => lang.code === sourceLanguage)?.name || sourceLanguage;
    const targetLang = languages.find(lang => lang.code === targetLanguage)?.name || targetLanguage;
    
    console.log(`Translating from ${sourceLang} to ${targetLang}:`, text);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system", 
          content: `You are a translator from ${sourceLang} to ${targetLang}. Translate the following text accurately and naturally, preserving the meaning and tone of the original text.`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    console.log('Translation complete');
    res.json({ translation: completion.choices[0].message.content });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cleanup function to remove any temporary files on server start/restart
function cleanupTempFiles() {
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(tempDir, file));
          console.log(`Cleaned up temporary file: ${file}`);
        } catch (error) {
          console.error(`Error deleting ${file}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up temporary files:', error);
  }
}

// Clean up any leftover temporary files
cleanupTempFiles();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Key configured: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
}); 