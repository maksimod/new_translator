require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

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

// API endpoint to get supported languages
app.get('/api/languages', (req, res) => {
  res.json(languages);
});

// API endpoint for transcription
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData, sourceLanguage } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(audioData.split(',')[1], 'base64');
    
    // Create a temporary file path
    const tempFilePath = path.join(__dirname, 'temp_audio.webm');
    
    // Write the buffer to a temporary file
    fs.writeFileSync(tempFilePath, buffer);
    
    // Use the file for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: sourceLanguage
    });
    
    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    
    res.json({ text: transcription.text });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 