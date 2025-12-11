
import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, ChatMessage, FluencyFeedback } from '../types';
import { createPcmBlob, decodeAudioData, downsampleTo16000 } from '../utils/audioUtils';

interface UseGeminiLiveProps {
  systemInstruction: string;
}

export const useGeminiLive = ({ systemInstruction }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [volume, setVolume] = useState(0); 
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [fluencyFeedback, setFluencyFeedback] = useState<FluencyFeedback>('neutral');
  const [userTranscript, setUserTranscript] = useState('');

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  
  // Media Recorder for saving user session
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');
  // Use 'any' for timeout ref to avoid NodeJS namespace issues in browser environment
  const feedbackTimeoutRef = useRef<any>(null);

  const stopAudioProcessing = useCallback(() => {
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsModelSpeaking(false);
    setVolume(0);
    setFluencyFeedback('neutral');
    setUserTranscript('');
  }, []);

  const sendClientMessage = useCallback(async (text: string) => {
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        await session.send(text, true);
      } catch (err) {
        console.error("Failed to send client message:", err);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);
      setMessages([]);
      currentInputRef.current = '';
      currentOutputRef.current = '';
      setUserTranscript('');
      audioChunksRef.current = []; // Reset audio chunks

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;

      // Start Recording
      try {
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        recorder.start();
      } catch (e) {
        console.warn("MediaRecorder not supported or failed", e);
      }

      const inputSource = inputAudioContextRef.current.createMediaStreamSource(stream);
      const inputSampleRate = inputAudioContextRef.current.sampleRate;
      
      const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        let sum = 0;
        for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);
        setVolume(Math.min(rms * 5, 1));

        // Only send audio if not muted
        if (!isMuted) {
          const downsampledData = downsampleTo16000(inputData, inputSampleRate);
          const pcmBlob = createPcmBlob(downsampledData);
          
          if (sessionPromiseRef.current) {
              sessionPromiseRef.current.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
              }).catch(console.error);
          }
        }
      };

      inputSource.connect(processor);
      processor.connect(inputAudioContextRef.current.destination);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }, // Female voice
          },
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: async () => {
            console.log('Session Opened');
            setConnectionState(ConnectionState.CONNECTED);
            // Trigger AI to speak first
            const session = await sessionPromiseRef.current;
            await session.send("The student is ready. Introduce yourself as HeyKoli and start Part 1.", true); 
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
               setIsModelSpeaking(true);
               const ctx = outputAudioContextRef.current;
               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
               
               try {
                   const buffer = await decodeAudioData(audioData, ctx, 24000);
                   const source = ctx.createBufferSource();
                   source.buffer = buffer;
                   source.connect(ctx.destination);
                   source.addEventListener('ended', () => {
                       activeSourcesRef.current.delete(source);
                       if (activeSourcesRef.current.size === 0) setIsModelSpeaking(false);
                   });
                   source.start(nextStartTimeRef.current);
                   activeSourcesRef.current.add(source);
                   nextStartTimeRef.current += buffer.duration;
               } catch (decodeErr) {
                   console.error("Decoding error", decodeErr);
               }
            }

            if (message.serverContent?.inputTranscription?.text) {
                const text = message.serverContent.inputTranscription.text;
                currentInputRef.current += text;
                setUserTranscript(currentInputRef.current);
                
                const lowerText = text.toLowerCase();
                // Real-time fluency feedback logic
                if (/\b(um|uh|er|ah)\b/.test(lowerText)) {
                    setFluencyFeedback('bad');
                    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
                    feedbackTimeoutRef.current = setTimeout(() => setFluencyFeedback('neutral'), 600);
                } 
                else if (/[.!?]/.test(text)) {
                    setFluencyFeedback('good');
                    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
                    feedbackTimeoutRef.current = setTimeout(() => setFluencyFeedback('neutral'), 600);
                }
            }
            if (message.serverContent?.outputTranscription?.text) {
                currentOutputRef.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
                const userText = currentInputRef.current.trim();
                const modelText = currentOutputRef.current.trim();
                if (userText) {
                    setMessages(prev => [...prev, { id: Date.now() + '-user', role: 'user', text: userText }]);
                    currentInputRef.current = '';
                    setUserTranscript('');
                }
                if (modelText) {
                    setMessages(prev => [...prev, { id: Date.now() + '-model', role: 'model', text: modelText }]);
                    currentOutputRef.current = '';
                }
            }
            
            if (message.serverContent?.interrupted) {
                activeSourcesRef.current.forEach(s => s.stop());
                activeSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setIsModelSpeaking(false);
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
            stopAudioProcessing();
          },
          onerror: (err) => {
            console.error(err);
            setConnectionState(ConnectionState.ERROR);
            setError("Connection to AI service failed. Please check your network connection.");
            stopAudioProcessing();
          }
        }
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect to the AI service.");
      setConnectionState(ConnectionState.ERROR);
      stopAudioProcessing();
    }
  }, [systemInstruction, stopAudioProcessing, isMuted]);

  const disconnect = useCallback(async (): Promise<Blob | null> => {
    if (sessionPromiseRef.current) {
        try { (await sessionPromiseRef.current).close(); } catch (e) {}
        sessionPromiseRef.current = null;
    }
    stopAudioProcessing();
    setConnectionState(ConnectionState.DISCONNECTED);
    
    // Return the recorded audio
    if (audioChunksRef.current.length > 0) {
      return new Blob(audioChunksRef.current, { type: 'audio/webm' });
    }
    return null;
  }, [stopAudioProcessing]);

  useEffect(() => {
    return () => stopAudioProcessing();
  }, [stopAudioProcessing]);

  return {
    connectionState,
    connect,
    disconnect,
    sendClientMessage,
    volume,
    isModelSpeaking,
    error,
    messages,
    isMuted,
    setIsMuted,
    fluencyFeedback,
    userTranscript
  };
};
