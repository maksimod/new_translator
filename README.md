# Speech Translator Web Application

A real-time speech translation web application that uses OpenAI API for transcription and translation between 12 popular languages.

## Features

- Voice recording and transcription using OpenAI's Whisper model
- Text translation using GPT-3.5-turbo
- Support for 12 languages: English, Spanish, French, German, Italian, Portuguese, Russian, Chinese, Japanese, Korean, Arabic, and Hindi
- Intuitive user interface with language switching capability
- Real-time status updates

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- An OpenAI API key

## Installation

1. Clone the repository:
```
git clone <repository-url>
cd speech-translator
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file in the root directory and add your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key
```

4. Start the server:
```
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Select the source language (the language you will speak in)
2. Select the target language (the language you want the translation in)
3. Click the "Start Recording" button and begin speaking
4. Click "Stop Recording" when you are done
5. Wait for the transcription and translation to complete
6. View your original text and its translation

## Technical Details

- The application uses Express.js for the backend server
- OpenAI's Whisper model for speech-to-text transcription
- OpenAI's GPT-3.5-turbo for text translation
- Frontend is built with vanilla JavaScript, HTML, and CSS
- Audio is recorded using the MediaRecorder Web API

## Troubleshooting

- **Microphone access denied**: Make sure to grant microphone permissions to the web application
- **Transcription errors**: Ensure you're speaking clearly and in a quiet environment
- **API errors**: Check that your OpenAI API key is valid and has sufficient credits

## License

MIT 