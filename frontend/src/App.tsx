import { useState, useRef, useEffect } from 'react'
import YouTube from 'react-youtube'
import stringSimilarity from 'string-similarity'
import * as vosk from 'vosk-browser'
import './App.css'

interface TranscriptSnippet {
  text: string;
  start: number;
  duration: number;
}

function App() {
  const [url, setUrl] = useState('')
  const [videoID, setVideoID] = useState('')
  const [transcript, setTranscript] = useState<TranscriptSnippet[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  
  // Vosk STT state
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [isModelReady, setIsModelReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recognizedText, setRecognizedText] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ word: string, match: boolean }[]>([])

  const playerRef = useRef<any | null>(null)
  const checkTimeInterval = useRef<number | null>(null)
  
  // Vosk Refs
  const modelRef = useRef<vosk.Model | null>(null)
  const recognizerRef = useRef<vosk.KaldiRecognizer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  // Load Vosk Model on mount
  useEffect(() => {
    const loadModel = async () => {
      setIsModelLoading(true)
      try {
        // Point to the local .tar.gz file in the public folder
        const model = await vosk.createModel('/models/model-en-us.tar.gz')
        modelRef.current = model
        setIsModelReady(true)
      } catch (err: any) {
        console.error('Failed to load Vosk model', err)
        setError('Failed to load local speech model. Please check your internet connection for the initial download.')
      } finally {
        setIsModelLoading(false)
      }
    }
    loadModel()

    return () => {
        // Cleanup Vosk resources
        stopRecording();
        if (modelRef.current) modelRef.current.terminate();
    }
  }, [])

  const extractVideoID = (url: string) => {
    const patterns = [
        /(?:v=|\/)([0-9A-Za-z_-]{11}).*/,
        /youtu\.be\/([0-9A-Za-z_-]{11})/,
        /embed\/([0-9A-Za-z_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return '';
  }

  const fetchTranscript = async () => {
    const id = extractVideoID(url);
    if (!id) {
        setError('Invalid YouTube URL');
        return;
    }
    setVideoID(id);
    setIsPlayerReady(false);
    setLoading(true);
    setError('');
    setTranscript([]);
    setCurrentIndex(-1);
    setRecognizedText('');
    setScore(null);
    setFeedback([]);
    
    try {
      const response = await fetch(`http://localhost:8000/api/transcript?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to fetch transcript');
      }
      const data = await response.json();
      setTranscript(data);
      setCurrentIndex(0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const onPlayerReady = (event: any) => {
    playerRef.current = event.target;
    setIsPlayerReady(true);
  }

  const onPlayerStateChange = (event: any) => {
    if (event.data === 1) { // 1 is PLAYING
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }

  useEffect(() => {
    if (isPlaying && currentIndex !== -1 && transcript[currentIndex]) {
      const snippet = transcript[currentIndex];
      const endTime = snippet.start + snippet.duration;
      
      checkTimeInterval.current = window.setInterval(() => {
        if (playerRef.current) {
          const currentTime = playerRef.current.getCurrentTime();
          if (currentTime >= endTime) {
            playerRef.current.pauseVideo();
            if (checkTimeInterval.current) clearInterval(checkTimeInterval.current);
          }
        }
      }, 100);
    } else {
      if (checkTimeInterval.current) clearInterval(checkTimeInterval.current);
    }

    return () => {
      if (checkTimeInterval.current) clearInterval(checkTimeInterval.current);
    };
  }, [isPlaying, currentIndex, transcript]);

  const startShadowing = () => {
    setRecognizedText('');
    setScore(null);
    setFeedback([]);

    if (playerRef.current && typeof playerRef.current.seekTo === 'function' && transcript[currentIndex]) {
      try {
        const snippet = transcript[currentIndex];
        playerRef.current.seekTo(snippet.start, true);
        playerRef.current.playVideo();
      } catch (e) {
        console.error('Error controlling player:', e);
        setError('Error controlling the YouTube player. Try refreshing the page.');
      }
    } else {
        if (!isPlayerReady) {
            setError('Player is still initializing. Please wait a moment.');
        } else if (transcript.length === 0) {
            setError('No transcript available. Please fetch a video first.');
        } else {
            setError('Player communication error.');
        }
    }
  }

  const startRecording = async () => {
    if (!modelRef.current || !isModelReady) return;

    try {
      setRecognizedText('');
      setScore(null);
      setFeedback([]);
      setError('');

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      if (!recognizerRef.current) {
        recognizerRef.current = new modelRef.current.KaldiRecognizer(16000);
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (recognizerRef.current) {
          // The library expects an AudioBuffer for acceptWaveform
          recognizerRef.current.acceptWaveform(event.inputBuffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      setIsRecording(true);
    } catch (err: any) {
      console.error('Failed to start recording', err);
      setError(`Failed to access microphone: ${err.message}`);
    }
  }

  const stopRecording = () => {
    if (!isRecording) return;

    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
    }
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (recognizerRef.current) {
        // Listen for the result event
        const onResult = (message: any) => {
            if (message.event === 'result') {
                const text = message.result.text || '';
                setRecognizedText(text);
                compareText(text);
                recognizerRef.current?.removeEventListener('result', onResult);
            }
        };
        
        recognizerRef.current.on('result', onResult);
        recognizerRef.current.retrieveFinalResult();
    }

    setIsRecording(false);
  }

  const compareText = (spoken: string) => {
    if (currentIndex === -1 || !transcript[currentIndex]) return;
    
    const target = transcript[currentIndex].text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
    const spokenClean = spoken.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
    
    const similarity = stringSimilarity.compareTwoStrings(target, spokenClean);
    setScore(Math.round(similarity * 100));

    const targetWords = target.split(/\s+/);
    const spokenWords = spokenClean.split(/\s+/);
    
    const newFeedback = targetWords.map(word => ({
      word,
      match: spokenWords.includes(word)
    }));
    
    setFeedback(newFeedback);
  }

  const nextSnippet = () => {
    if (currentIndex < transcript.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setRecognizedText('');
      setScore(null);
      setFeedback([]);
    }
  }

  const prevSnippet = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setRecognizedText('');
      setScore(null);
      setFeedback([]);
    }
  }

  return (
    <div className="container">
      <h1>English Shadowing Practice</h1>
      
      {isModelLoading && <p className="status-msg">Loading Local Voice Model (~50MB)... This will be cached.</p>}
      {isModelReady && <p className="status-msg success">Local Voice Model Ready ✅</p>}

      <div className="input-group">
        <input 
          type="text" 
          placeholder="Paste YouTube URL here..." 
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button onClick={fetchTranscript} disabled={loading}>
          {loading ? 'Loading...' : 'Start Practice'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {videoID && (
        <div className="video-section">
          {!isPlayerReady && <p className="loading-player">Initializing YouTube Player...</p>}
          <div style={{ display: isPlayerReady ? 'block' : 'none' }}>
            <YouTube 
                videoId={videoID} 
                opts={{ 
                    width: '640', 
                    height: '390', 
                    playerVars: { 
                        autoplay: 0,
                        origin: window.location.origin,
                        enablejsapi: 1
                    } 
                }}
                onReady={onPlayerReady}
                onStateChange={onPlayerStateChange}
            />
          </div>

          <div className="controls">
            <button onClick={prevSnippet} disabled={currentIndex <= 0}>Previous</button>
            <button onClick={startShadowing}>1. Play Sentence</button>
            
            {!isRecording ? (
                <button 
                    onClick={startRecording} 
                    disabled={!isModelReady || isRecording}
                    className={!isModelReady ? 'disabled' : ''}
                >
                    {isModelReady ? '2. Start Recording' : 'Model Loading...'}
                </button>
            ) : (
                <button onClick={stopRecording} className="recording-btn">
                    Stop & Compare
                </button>
            )}
            
            <button onClick={nextSnippet} disabled={currentIndex >= transcript.length - 1}>Next</button>
          </div>

          {score !== null && (
            <div className="feedback">
              <h3>Accuracy Score: {score}%</h3>
              <p>Recognized: "{recognizedText}"</p>
              <div className="word-comparison">
                {feedback.map((item, index) => (
                  <span key={index} className={item.match ? 'matched' : 'unmatched'}>
                    {item.word}{' '}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {transcript.length > 0 && (
        <div className="transcript-container">
          {transcript.map((snippet, index) => (
            <div 
                key={index} 
                className={`transcript-item ${index === currentIndex ? 'active' : ''}`}
                onClick={() => {
                    setCurrentIndex(index);
                    setRecognizedText('');
                    setScore(null);
                    setFeedback([]);
                }}
            >
              <span>{snippet.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
