from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
import sys

def test_video(video_id):
    print(f"Testing video: {video_id}")
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        
        print("Available transcripts:")
        for t in transcript_list:
            print(f" - {t.language} ({t.language_code}) [Generated: {t.is_generated}]")
            
        try:
            transcript = transcript_list.find_manually_created_transcript(['en'])
            print("Found manual English transcript")
        except NoTranscriptFound:
            try:
                transcript = transcript_list.find_generated_transcript(['en'])
                print("Found generated English transcript")
            except NoTranscriptFound:
                print("No English transcript found (manual or generated)")
                return
        
        data = transcript.fetch()
        print(f"Successfully fetched {len(data)} snippets")
        if data:
            print(f"Snippet type: {type(data[0])}")
            print(f"Snippet sample: {data[0]}")
        
    except Exception as e:
        print(f"Error: {type(e).__name__}: {str(e)}")

if __name__ == "__main__":
    videos = ["5MuIMqhT8DM", "eIho2S0ZahI", "FfyMZejIgv8"]
    for v in videos:
        test_video(v)
        print("-" * 20)
