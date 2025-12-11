import { Blob } from '@google/genai';

// Convert PCM Float32 data to 16-bit integer PCM and then to a base64 encoded string
export function base64EncodeAudio(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp values to [-1, 1] then scale to Int16 range
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert Int16Array to Uint8Array for binary processing
  const uint8Array = new Uint8Array(int16Array.buffer);
  
  // Manual binary to string conversion to avoid call stack size limits with spread operator
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

// Simple downsampling from input sample rate to 16000Hz
export function downsampleTo16000(buffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer;
  }
  
  const ratio = inputSampleRate / 16000;
  const newLength = Math.floor(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    // Simple averaging (box filter) to prevent aliasing
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < buffer.length; j++) {
      sum += buffer[j];
      count++;
    }
    
    result[i] = count > 0 ? sum / count : 0;
  }
  
  return result;
}

// Helper to create the Blob structure expected by Gemini Live API
export function createPcmBlob(data: Float32Array): Blob {
  return {
    data: base64EncodeAudio(data),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Decode base64 raw PCM string to AudioBuffer
export async function decodeAudioData(
  base64String: string,
  audioContext: AudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const dataInt16 = new Int16Array(bytes.buffer);
  
  // Gemini Live sends mono audio usually, but let's handle it safely
  const buffer = audioContext.createBuffer(1, dataInt16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
}