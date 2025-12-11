
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export enum Language {
  ENGLISH = 'English',
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  HINDI = 'Hindi',
  JAPANESE = 'Japanese',
  KOREAN = 'Korean',
  CHINESE = 'Chinese',
  PORTUGUESE = 'Portuguese',
  ITALIAN = 'Italian'
}

export enum TestPart {
  IDLE = 'idle',
  PART1 = 'part1',
  PART2_PREP = 'part2_prep',
  PART2_SPEAKING = 'part2_speaking',
  PART3 = 'part3',
  EVALUATION = 'evaluation'
}

export type FluencyFeedback = 'neutral' | 'good' | 'bad';

export interface AudioVisualizerState {
  volume: number; // 0 to 1
  isSpeaking: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export interface Part1Evaluation {
  score: number;
  feedback: string;
}

export interface FluencySegment {
  type: 'speech' | 'good-pause' | 'bad-pause' | 'filler';
  text?: string;
  duration?: number; // relative duration for visualization width
}

export interface FluencyAnalysis {
  segments: FluencySegment[];
  fillersCount: number;
  badPausesCount: number;
  goodPausesCount: number;
}

export interface BandScore {
  overall: number;
  fluency: number;
  lexical: number;
  grammar: number;
  pronunciation: number;
  feedback: string;
  // Detailed feedback per criterion
  fluencyFeedback: string;
  lexicalFeedback: string;
  grammarFeedback: string;
  pronunciationFeedback: string;
  fluencyAnalysis?: FluencyAnalysis;
  audioStorageId?: string; // ID to retrieve audio from IndexedDB
}

export interface TestResult extends BandScore {
  id: string;
  timestamp: number;
  topic: string;
  part1Evaluation?: Part1Evaluation;
}
