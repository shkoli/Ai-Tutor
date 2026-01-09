
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
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');

  const stopAudioProcessing = useCallback(() => {
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

  const connect = useCallback(async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);
      setMessages([]);
      currentInputRef.current = '';
      currentOutputRef.current = '';
      setUserTranscript('');
      audioChunksRef.current = [];

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.start();

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

        if (!isMuted && sessionPromiseRef.current) {
          const downsampledData = downsampleTo16000(inputData, inputSampleRate);
          const pcmBlob = createPcmBlob(downsampledData);
          sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({ media: pcmBlob });
          }).catch(() => {});
        }
      };

      inputSource.connect(processor);
      processor.connect(inputAudioContextRef.current.destination);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: async () => {
            setConnectionState(ConnectionState.CONNECTED);
            const session = await sessionPromiseRef.current;
            await session.send("Hello Koli! Start the IELTS session.", true); 
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
               } catch (e) {}
            }

            if (message.serverContent?.inputTranscription?.text) {
                const text = message.serverContent.inputTranscription.text;
                currentInputRef.current += text;
                setUserTranscript(currentInputRef.current);
            }
            if (message.serverContent?.outputTranscription?.text) {
                currentOutputRef.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
                if (currentInputRef.current.trim()) {
                    setMessages(prev => [...prev, { id: Date.now() + '-u', role: 'user', text: currentInputRef.current }]);
                    currentInputRef.current = '';
                }
                if (currentOutputRef.current.trim()) {
                    setMessages(prev => [...prev, { id: Date.now() + '-m', role: 'model', text: currentOutputRef.current }]);
                    currentOutputRef.current = '';
                }
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
            stopAudioProcessing();
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            const msg = err?.message || "";
            setConnectionState(ConnectionState.ERROR);
            if (msg.includes("Requested entity was not found") || msg.includes("404")) {
                setError("BILLING_REQUIRED");
            } else {
                setError(msg || "Network connection failed.");
            }
            stopAudioProcessing();
          }
        }
      });
    } catch (err: any) {
      setError(err.message || "Failed to initialize audio stream.");
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
    return audioChunksRef.current.length > 0 ? new Blob(audioChunksRef.current, { type: 'audio/webm' }) : null;
  }, [stopAudioProcessing]);

  return {
    connectionState,
    connect,
    disconnect,
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
