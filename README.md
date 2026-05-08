# English Shadowing App

This app helps you practice English speaking by shadowing YouTube videos.

## Features
- Fetch transcripts from YouTube videos (English only).
- Play video sentence by sentence.
- Automatic pausing at the end of each sentence.
- Voice recording and speech-to-text comparison.
- Visual feedback on matching words and accuracy score.

## Setup & Running

### Prerequisites
- Python 3.x
- Node.js & npm
- Google Chrome (required for Web Speech API)

### 1. Start the Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn youtube-transcript-api
uvicorn main:app --reload
```
The backend will run at `http://localhost:8000`.

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend will run at `http://localhost:5173`.

## How to Use
1. Paste a YouTube URL (e.g., `https://www.youtube.com/watch?v=UF8uR6Z6KLc`).
2. Click **Start Practice**.
3. Use **1. Play Sentence** to listen to the current sentence. The video will pause automatically.
4. Click **2. Record Your Voice** and speak the sentence.
5. Review your **Accuracy Score** and the matched/unmatched words.
6. Click **Next** to move to the next sentence.
