require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const SECRET_CODE = '!*^&dfUHe378';

// HTTP server
const httpServer = http.createServer(app);

// Generate self-signed certificate for HTTPS
const generateSelfSignedCert = () => {
  try {
    // Check if certificates already exist
    const keyPath = path.join(__dirname, 'server.key');
    const certPath = path.join(__dirname, 'server.cert');
    
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      console.log('Using existing certificates');
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
    
    // Otherwise, generate new certificates
    const { execSync } = require('child_process');
    
    // Generate private key
    execSync('openssl genrsa -out server.key 2048');
    console.log('Generated server.key');
    
    // Generate self-signed certificate
    execSync('openssl req -new -key server.key -out server.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"');
    execSync('openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.cert');
    console.log('Generated server.cert');
    
    // Clean up CSR file
    if (fs.existsSync('server.csr')) {
      fs.unlinkSync('server.csr');
    }
    
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  } catch (error) {
    console.error('Error generating certificates:', error);
    // Return dummy values that will cause an error when used
    return { key: 'FAILED', cert: 'FAILED' };
  }
};

// HTTPS server with self-signed certificate
let httpsServer;
try {
  const credentials = generateSelfSignedCert();
  httpsServer = https.createServer(credentials, app);
} catch (error) {
  console.error('Failed to create HTTPS server:', error);
}

// Configure HTTP and HTTPS agents with keep-alive and connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 60000 // 60 seconds
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 60000, // 60 seconds
  rejectUnauthorized: true // Enable proper SSL verification
});

// Initialize OpenAI with connection pooling
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3, // Enable retries
  timeout: 60000 // 60 second timeout
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // set to true if using https only
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Authentication middleware
const authenticateCode = (req, res, next) => {
  // Paths that are always allowed without authentication
  const allowedPaths = [
    '/auth',
    '/styles.css',
    '/auth.css'
  ];
  
  if (allowedPaths.includes(req.path)) {
    return next();
  }
  
  // Check if user is authenticated
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // If AJAX request, return 401
  if (req.xhr || req.headers.accept.indexOf('json') !== -1) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // If not authenticated, redirect to auth page
  res.redirect('/auth');
};

// Serve the authentication page
app.get('/auth', (req, res) => {
  // If already authenticated, redirect to main page
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// Handle authentication
app.post('/auth', (req, res) => {
  const { code } = req.body;
  
  if (code === SECRET_CODE) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    // Redirect with error parameter
    res.redirect('/auth?error=true');
  }
});

// Handle logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth');
  });
});

// First apply authentication middleware to all routes
app.use(authenticateCode);

// Then serve static files (after auth check)
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
  let retryCount = 0;
  const maxRetries = 3;
  
  async function attemptTranscription() {
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
        
        // Check if this is a connection reset error that can be retried
        const isConnReset = error.toString().includes('ECONNRESET') || 
                           (error.cause && error.cause.code === 'ECONNRESET');
        
        // Retry logic for network-related errors
        if ((isConnReset || error.message.includes('Connection error')) && retryCount < maxRetries) {
          retryCount++;
          const delay = 1000 * Math.pow(1.5, retryCount); // Exponential backoff
          console.log(`ECONNRESET error, retrying transcription (${retryCount}/${maxRetries}) after ${delay}ms delay...`);
          
          // Wait then retry
          setTimeout(() => {
            attemptTranscription();
          }, delay);
          return;
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
      } else if (error.toString().includes('ECONNRESET') || 
                (error.cause && error.cause.code === 'ECONNRESET')) {
        errorMessage = 'Network connection reset. This is often temporary, please try again.';
      }
      
      res.status(500).json({ 
        error: errorMessage,
        retriedCount: retryCount,
        isNetworkError: error.toString().includes('ECONNRESET') || 
                       (error.cause && error.cause.code === 'ECONNRESET') ||
                       error.message.includes('Connection error')
      });
    }
  }
  
  // Start the transcription process with retry capability
  attemptTranscription();
});

// API endpoint for translation
app.post('/api/translate', async (req, res) => {
  let retryCount = 0;
  const maxRetries = 3;
  
  async function attemptTranslation() {
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
      
      // Check if this is a connection reset error that can be retried
      const isConnReset = error.toString().includes('ECONNRESET') || 
                         (error.cause && error.cause.code === 'ECONNRESET');
      
      // Retry logic for network-related errors
      if ((isConnReset || error.message.includes('Connection error')) && retryCount < maxRetries) {
        retryCount++;
        const delay = 1000 * Math.pow(1.5, retryCount); // Exponential backoff
        console.log(`ECONNRESET error, retrying translation (${retryCount}/${maxRetries}) after ${delay}ms delay...`);
        
        // Wait then retry
        setTimeout(() => {
          attemptTranslation();
        }, delay);
        return;
      }
      
      // If we've exhausted retries or it's not a retriable error, return error to client
      res.status(500).json({ 
        error: error.message,
        retriedCount: retryCount,
        isNetworkError: isConnReset || error.message.includes('Connection error')
      });
    }
  }
  
  // Start the translation process with retry capability
  attemptTranslation();
});

// Add a heartbeat endpoint for connection monitoring
app.head('/api/heartbeat', (req, res) => {
  res.status(200).end();
});

app.get('/api/heartbeat', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
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

// Add middleware for request timeouts
const addTimeout = (req, res, next) => {
  // Set a default timeout of 30 seconds for all API requests
  req.setTimeout(30000, () => {
    console.error('Request timeout');
    if (!res.headersSent) {
      res.status(503).json({ error: 'Request timeout', isNetworkError: true });
    }
  });
  next();
};

// Apply timeout middleware to API routes
app.use('/api', addTimeout);

// Add a test API endpoint for direct OpenAI communication
app.post('/api/test', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    console.log('Testing OpenAI API with prompt:', prompt);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });
    
    console.log('OpenAI API test successful');
    res.json({ 
      success: true, 
      response: completion.choices[0].message.content,
      model: "gpt-3.5-turbo-0125"
    });
  } catch (error) {
    console.error('OpenAI API test error:', error);
    
    // Provide detailed error information for debugging
    res.status(500).json({ 
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      errorDetails: error.toString(),
      cause: error.cause ? error.cause.toString() : null
    });
  }
});

// Add a direct proxy endpoint to OpenAI API (bypassing SDK for diagnostic purposes)
app.post('/api/proxy', async (req, res) => {
  try {
    const { endpoint, data, method = 'POST' } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'API endpoint is required' });
    }
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key is not configured' });
    }
    
    console.log(`Making direct API request to: ${endpoint} (${method})`);
    if (data) {
      console.log('Request data:', JSON.stringify(data));
    }
    
    // Make direct fetch request to OpenAI API
    const apiUrl = `https://api.openai.com/v1/${endpoint}`;
    
    const options = {
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      agent: httpsAgent
    };
    
    // Only add Content-Type and body for POST/PUT requests
    if (method !== 'GET' && data) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(apiUrl, options);
    
    // Get the response as text first
    const responseText = await response.text();
    
    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { text: responseText };
    }
    
    // Log the response status
    console.log(`Direct API response status: ${response.status}`);
    
    // Return both raw and parsed response
    res.status(response.status).json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
      raw: responseText
    });
  } catch (error) {
    console.error('Direct API proxy error:', error);
    
    res.status(500).json({
      error: 'Failed to make direct API request',
      message: error.message,
      stack: error.stack,
      cause: error.cause ? error.cause.toString() : null
    });
  }
});

// Start both HTTP and HTTPS servers
httpServer.listen(PORT, HOST, () => {
  console.log(`HTTP Server running on http://${HOST}:${PORT}`);
  console.log(`API Key configured: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
});

if (httpsServer) {
  httpsServer.listen(3001, HOST, () => {
    console.log(`HTTPS Server running on https://${HOST}:3001`);
    console.log(`Access via https://${HOST}:3001`);
  });
} 