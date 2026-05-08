import re
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

app = FastAPI()

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_video_id(url: str) -> str:
    """
    Extracts the video ID from various YouTube URL formats.
    """
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
        r"embed\/([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

@app.get("/api/transcript")
async def get_transcript(url: str = Query(..., description="The YouTube video URL")):
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    try:
        # Fetch the transcript. We prioritize English.
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        
        try:
            # Try to find a manually created English transcript
            transcript = transcript_list.find_manually_created_transcript(['en'])
        except NoTranscriptFound:
            try:
                # Fallback to generated English transcript
                transcript = transcript_list.find_generated_transcript(['en'])
            except NoTranscriptFound:
                # Last resort: Translate any available transcript to English
                # If this is too complex for now, we can just fail.
                # Let's try to find any transcript and translate it if possible.
                # Actually, the user asked to choose another video if no transcript is available.
                # So we fail if no English transcript is found (manual or auto).
                raise HTTPException(status_code=404, detail="No English transcript found for this video. Please choose another video.")

        data = transcript.fetch()
        
        # Merge snippets into sentences
        merged_snippets = []
        current_sentence = ""
        current_start = 0
        current_duration = 0
        
        for i, snippet in enumerate(data):
            text = snippet.text.strip()
            if not current_sentence:
                current_start = snippet.start
            
            current_sentence += " " + text
            current_duration += snippet.duration
            
            # Simple heuristic: end sentence if it ends with punctuation or is getting too long
            if text.endswith(('.', '?', '!')) or len(current_sentence) > 100:
                merged_snippets.append({
                    'text': current_sentence.strip(),
                    'start': current_start,
                    'duration': current_duration
                })
                current_sentence = ""
                current_duration = 0
        
        # Add remaining
        if current_sentence:
            merged_snippets.append({
                'text': current_sentence.strip(),
                'start': current_start,
                'duration': current_duration
            })

        return merged_snippets

    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Transcripts are disabled for this video.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
