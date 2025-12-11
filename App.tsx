
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { ConnectionState, TestPart, BandScore, Part1Evaluation, TestResult } from './types';
import { useGeminiLive } from './hooks/useGeminiLive';
import { Visualizer } from './components/Visualizer';
import { ChatHistory } from './components/ChatHistory';
import { Timer } from './components/Timer';
import { AvatarGlow } from './components/AvatarGlow';
import { FluencyVisualizer } from './components/FluencyVisualizer';
import { analyzeFluency } from './utils/fluencyUtils';
import { CUE_CARDS, PART1_TOPICS, SYSTEM_INSTRUCTIONS } from './utils/ieltsData';
import { getHistory, saveTestResult, clearHistory, deleteTestResult, getUsedCueCardIds, markCueCardAsUsed, clearUsedQuestions, saveAudioToDB, getAudioFromDB } from './utils/storageUtils';

const App: React.FC = () => {
  const [currentPart, setCurrentPart] = useState<TestPart>(TestPart.IDLE);
  const [cueCardIndex, setCueCardIndex] = useState(0);
  const [bandScore, setBandScore] = useState<BandScore | null>(null);
  const [part1Evaluation, setPart1Evaluation] = useState<Part1Evaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [history, setHistory] = useState<TestResult[]>([]);
  const [viewingResult, setViewingResult] = useState<TestResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Speaking Rate Tracking
  const [partStartWordCount, setPartStartWordCount] = useState(0);
  const [partStartTime, setPartStartTime] = useState(0);
  const [currentWPM, setCurrentWPM] = useState(0);
  
  // State to hold specific session instructions to prevent repetition
  const [sessionInstructions, setSessionInstructions] = useState(SYSTEM_INSTRUCTIONS.EXAMINER);

  const { 
    connectionState, 
    connect, 
    disconnect, 
    sendClientMessage,
    volume, 
    isModelSpeaking, 
    messages,
    isMuted,
    setIsMuted,
    error,
    fluencyFeedback,
    userTranscript
  } = useGeminiLive({ systemInstruction: sessionInstructions });

  const isConnected = connectionState === ConnectionState.CONNECTED;
  
  // Calculate total words spoken by user so far (completed messages + current transcript)
  const calculateTotalWords = useCallback(() => {
    const historicalCount = messages
      .filter(m => m.role === 'user')
      .reduce((acc, m) => acc + (m.text.trim().split(/\s+/).length || 0), 0);
    const currentCount = userTranscript.trim() ? userTranscript.trim().split(/\s+/).length : 0;
    return historicalCount + currentCount;
  }, [messages, userTranscript]);
  
  // Ref to hold total words to avoid dependency issues in interval
  const totalWordsRef = useRef(0);
  totalWordsRef.current = calculateTotalWords();

  // Load history on mount
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  // Auto-mute during Part 2 Prep
  useEffect(() => {
    if (currentPart === TestPart.PART2_PREP) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  }, [currentPart, setIsMuted]);
  
  // Reset Word Count Baseline when entering Speaking Parts
  useEffect(() => {
    if (currentPart === TestPart.PART2_SPEAKING || currentPart === TestPart.PART3) {
      setPartStartWordCount(totalWordsRef.current);
      setPartStartTime(Date.now());
      setCurrentWPM(0);
    }
  }, [currentPart]);

  // WPM Calculation Interval
  useEffect(() => {
    let interval: any;
    if ((currentPart === TestPart.PART2_SPEAKING || currentPart === TestPart.PART3) && partStartTime > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedMinutes = (now - partStartTime) / 60000;
        const wordsAdded = Math.max(0, totalWordsRef.current - partStartWordCount);
        
        if (elapsedMinutes > 0.05) { // Wait ~3 seconds before calc to avoid Infinity/Spikes
           const wpm = Math.round(wordsAdded / elapsedMinutes);
           setCurrentWPM(wpm);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentPart, partStartTime, partStartWordCount]);

  const selectRandomQuestions = useCallback(() => {
    // 1. Pick 3 random Part 1 topics
    const shuffledTopics = [...PART1_TOPICS].sort(() => 0.5 - Math.random());
    const selectedPart1 = shuffledTopics.slice(0, 3);

    // 2. Pick a random, unused Cue Card for Part 2
    const usedIds = getUsedCueCardIds();
    // If all used, reset
    if (usedIds.length >= CUE_CARDS.length) {
       clearUsedQuestions();
    }
    
    const availableCards = CUE_CARDS.filter(card => !usedIds.includes(card.id));
    // Fallback if filter fails (e.g. strict reset didn't work immediately)
    const pool = availableCards.length > 0 ? availableCards : CUE_CARDS;
    
    const randomCardIndex = Math.floor(Math.random() * pool.length);
    const selectedCard = pool[randomCardIndex];
    
    // Find the original index for UI rendering consistency
    const originalIndex = CUE_CARDS.findIndex(c => c.id === selectedCard.id);
    setCueCardIndex(originalIndex);
    
    // Mark as used
    markCueCardAsUsed(selectedCard.id);

    // 3. Construct dynamic system instruction
    const instructions = `
      ${SYSTEM_INSTRUCTIONS.EXAMINER}

      SPECIFIC SESSION DATA (DO NOT CHANGE):
      
      PART 1 TOPICS: Ask 3-4 questions based on these themes: ${selectedPart1.join(', ')}.
      
      PART 2 CUE CARD: The candidate has been given the card: "${selectedCard.title}".
      Bullets: ${selectedCard.bullets.join(', ')}.
      
      PART 3 DISCUSSION: Ask 4-5 abstract, complex questions related to the theme of "${selectedCard.title}". 
      (e.g., if topic is 'Time', ask about time management in modern society).
      
      Start the test now by introducing yourself as Koli and asking for the candidate's full name.
    `;
    
    setSessionInstructions(instructions);
  }, []);

  const handleStartTest = () => {
    selectRandomQuestions();
    
    setCurrentPart(TestPart.PART1);
    setBandScore(null);
    setPart1Evaluation(null);
    setViewingResult(null);
    setAudioUrl(null);
    
    // We need to wait for state to settle. 
    setTimeout(() => connect(), 100);
  };

  const evaluatePart1 = async (currentMessages: any[]) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const transcript = currentMessages.map(m => `${m.role}: ${m.text}`).join('\n');
      
      const prompt = `
        Act as an IELTS Examiner. Evaluate this Part 1 transcript (Introduction).
        The candidate should have answered questions about their home, work, studies, or interests concisely.
        
        Transcript:
        ${transcript}

        Provide a preliminary band score (0.0-9.0) and a brief 1-sentence feedback observation focusing on fluency and clarity.
      `;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
             type: Type.OBJECT,
             properties: {
               score: { type: Type.NUMBER },
               feedback: { type: Type.STRING },
             }
          }
        }
      });
      const data = JSON.parse(result.text || '{}');
      setPart1Evaluation(data);
    } catch (e) {
      console.error("Part 1 Eval failed", e);
    }
  };

  const handleNextPart = () => {
    switch (currentPart) {
      case TestPart.PART1:
        // Trigger Part 1 Evaluation
        evaluatePart1(messages);
        
        // Transition to Part 2 Preparation
        setCurrentPart(TestPart.PART2_PREP);
        
        // Explicitly tell AI to move to Part 2 with the selected card
        const card = CUE_CARDS[cueCardIndex];
        const prepInstruction = `Time for Part 2. The cue card topic is: "${card.title}". Please explicitly state this topic to the student and tell them they have 1 minute to prepare notes.`;
        sendClientMessage(prepInstruction);
        break;
        
      case TestPart.PART2_PREP:
        // Transition to Part 2 Speaking (Long Turn)
        setCurrentPart(TestPart.PART2_SPEAKING);
        // Explicitly tell AI to start listening
        sendClientMessage("Preparation time is over. Please ask the candidate to start speaking now.");
        break;
        
      case TestPart.PART2_SPEAKING:
        // Transition to Part 3 Discussion
        setCurrentPart(TestPart.PART3);
        const card3 = CUE_CARDS[cueCardIndex];
        sendClientMessage(`Time is up. Move to Part 3. Ask abstract questions related to: "${card3.title}".`);
        break;
        
      case TestPart.PART3:
        // Finish Test
        handleFinishTest();
        break;
      default:
        console.warn('Unknown transition from:', currentPart);
        break;
    }
  };

  const handleFinishTest = async () => {
    setCurrentPart(TestPart.EVALUATION);
    // Disconnect and get the recorded audio blob
    const audioBlob = await disconnect();
    
    // Save audio to IndexedDB
    let audioId = undefined;
    if (audioBlob) {
        try {
            audioId = await saveAudioToDB(audioBlob);
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);
        } catch (e) {
            console.error("Failed to save audio", e);
        }
    }

    setIsEvaluating(true);

    try {
      // Evaluate using Gemini Flash
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Filter user messages for fluency analysis
      // Improved joining: Ensure periods exist between separate turns to avoid merging sentences
      const userText = messages
        .filter(m => m.role === 'user')
        .map(m => {
          const txt = m.text.trim();
          return ['.', '!', '?'].includes(txt.slice(-1)) ? txt : txt + '.';
        })
        .join(' ');
        
      const fluencyAnalysis = analyzeFluency(userText);

      const transcript = messages.map(m => `${m.role}: ${m.text}`).join('\n');
      
      const prompt = `
        Act as a strict IELTS Examiner. Evaluate the following speaking test transcript.
        Transcript:
        ${transcript}

        Provide a JSON response with:
        - overall (number 0-9)
        - fluency (number 0-9)
        - fluencyFeedback (string): Explain the fluency score. Cite specific examples from the transcript (e.g., "User hesitated frequently at...", "Good flow in Part 2").
        - lexical (number 0-9)
        - lexicalFeedback (string): Evaluate vocabulary. Cite specific words or phrases used (e.g., "Good use of idiomatic expression '...' ", "Repetitive use of 'good'").
        - grammar (number 0-9)
        - grammarFeedback (string): Evaluate sentence structures and tense accuracy. Quote specific errors or complex sentences found in the transcript.
        - pronunciation (number 0-9)
        - pronunciationFeedback (string): As audio analysis is not available here, ESTIMATE pronunciation score based on:
          1. Sentence flow and length (ability to sustain complex sentences often correlates with better prosody).
          2. Coherence of ideas (which usually requires good stress and intonation).
          3. Explicitly state in the feedback that this is an estimation based on the transcript's complexity and flow.
        - feedback (string): A general summary of the candidate's performance.
      `;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
             type: Type.OBJECT,
             properties: {
               overall: { type: Type.NUMBER },
               fluency: { type: Type.NUMBER },
               fluencyFeedback: { type: Type.STRING },
               lexical: { type: Type.NUMBER },
               lexicalFeedback: { type: Type.STRING },
               grammar: { type: Type.NUMBER },
               grammarFeedback: { type: Type.STRING },
               pronunciation: { type: Type.NUMBER },
               pronunciationFeedback: { type: Type.STRING },
               feedback: { type: Type.STRING },
             }
          }
        }
      });

      const scoreData = JSON.parse(result.text || '{}');
      const finalScore: BandScore = { ...scoreData, fluencyAnalysis, audioStorageId: audioId };
      setBandScore(finalScore);

      // Save to History
      const resultEntry: TestResult = {
        ...finalScore,
        id: Date.now().toString(),
        timestamp: Date.now(),
        topic: CUE_CARDS[cueCardIndex].title,
        part1Evaluation: part1Evaluation || undefined
      };
      const updatedHistory = saveTestResult(resultEntry);
      setHistory(updatedHistory);

    } catch (e) {
      console.error("Evaluation failed", e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear your practice history?")) {
      clearHistory();
      setHistory([]);
    }
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this practice session?")) {
      const updated = deleteTestResult(id);
      setHistory(updated);
      if (viewingResult?.id === id) {
         handleBackToDashboard();
      }
    }
  };

  const handleViewResult = async (result: TestResult) => {
    setBandScore(result);
    setViewingResult(result);
    setCurrentPart(TestPart.EVALUATION);
    
    // Load Audio if available
    setAudioUrl(null);
    if (result.audioStorageId) {
        try {
            const blob = await getAudioFromDB(result.audioStorageId);
            if (blob) {
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
            }
        } catch (e) {
            console.error("Error loading audio", e);
        }
    }
  };

  const handleBackToDashboard = () => {
    setCurrentPart(TestPart.IDLE);
    setViewingResult(null);
    setBandScore(null);
    // Cleanup URL to avoid memory leaks
    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
    }
  };

  const renderContent = () => {
    if (currentPart === TestPart.IDLE) {
      return (
        <div className="flex flex-col items-center h-full w-full max-w-4xl mx-auto p-4 overflow-y-auto">
           <div className="flex flex-col items-center text-center space-y-6 mt-8 mb-12">
             <div className="w-24 h-24 bg-teal-50 rounded-full flex items-center justify-center p-2 ring-4 ring-teal-100 shadow-lg animate-fade-in">
               <div className="text-5xl">🧕</div>
             </div>
             <div className="animate-fade-in delay-100">
               <h2 className="text-4xl font-bold text-slate-800 tracking-tight">Welcome to <span className="text-teal-600">HeyKoli</span></h2>
               <p className="text-slate-500 mt-2 max-w-md mx-auto text-lg">
                 Your personal AI speaking partner. Practice IELTS or just chat to improve your English.
               </p>
             </div>
             <button 
               onClick={handleStartTest}
               className="px-10 py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-full font-bold text-lg shadow-xl shadow-teal-200 transition-all transform hover:-translate-y-1 animate-fade-in delay-200"
             >
               Start New Session
             </button>
           </div>

           {/* History Section */}
           <div className="w-full max-w-2xl animate-fade-in delay-300">
             <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-700">Practice History</h3>
                {history.length > 0 && (
                  <button onClick={handleClearHistory} className="text-xs text-rose-500 hover:text-rose-600 font-medium">
                    Clear History
                  </button>
                )}
             </div>
             
             {history.length === 0 ? (
               <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                 <p className="text-slate-400">No practice sessions yet.</p>
               </div>
             ) : (
               <div className="space-y-3">
                 {history.map((item) => (
                   <div 
                    key={item.id} 
                    onClick={() => handleViewResult(item)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between group"
                   >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white ${item.overall >= 7 ? 'bg-emerald-500' : item.overall >= 6 ? 'bg-amber-500' : 'bg-rose-500'}`}>
                           {item.overall}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 group-hover:text-teal-600 transition-colors line-clamp-1">
                            {item.topic || "Practice Session"}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                             <span>{new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                             {item.audioStorageId && <span className="text-teal-500">🎤 Audio Saved</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => handleDeleteItem(e, item.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <div className="text-slate-400">
                          →
                        </div>
                      </div>
                   </div>
                 ))}
               </div>
             )}
           </div>
        </div>
      );
    }

    if (currentPart === TestPart.EVALUATION) {
      const evaluationData = isEvaluating ? null : (viewingResult || bandScore);
      const part1Data = viewingResult?.part1Evaluation || part1Evaluation;

      return (
         <div className="flex flex-col items-center h-full w-full max-w-3xl mx-auto p-4 overflow-y-auto">
            <div className="flex items-center justify-between w-full mb-6">
               <h2 className="text-2xl font-bold text-slate-800">
                 {viewingResult ? 'Past Result' : 'Performance Report'}
               </h2>
               {viewingResult && (
                 <span className="text-sm text-slate-500">
                    {new Date(viewingResult.timestamp).toLocaleDateString()}
                 </span>
               )}
            </div>
            
            {isEvaluating ? (
               <div className="flex flex-col items-center space-y-4 my-12">
                 <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                 <p className="text-slate-500">Koli is analyzing your speech...</p>
               </div>
            ) : evaluationData ? (
               <div className="w-full space-y-8 pb-10">
                  {/* Overall Score Card */}
                  <div className="bg-slate-900 text-white p-8 rounded-3xl flex items-center justify-between shadow-2xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-teal-500 opacity-20 rounded-full blur-2xl"></div>
                     <div className="relative z-10">
                       <div className="text-teal-400 text-sm uppercase tracking-wider font-semibold">Overall Band Score</div>
                       <div className="text-6xl font-extrabold mt-2 text-white">{evaluationData.overall}</div>
                     </div>
                     <div className="text-right relative z-10">
                       <div className="text-sm opacity-80 mb-1">CEFR Level</div>
                       <div className="font-bold text-2xl bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
                         {evaluationData.overall >= 8 ? 'C2' : evaluationData.overall >= 7 ? 'C1' : evaluationData.overall >= 5.5 ? 'B2' : 'B1'}
                       </div>
                     </div>
                  </div>
                  
                  {/* Part 1 Previous Score (if available) */}
                  {part1Data && (
                     <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                           <h3 className="font-bold text-slate-800 text-lg">Part 1 Performance</h3>
                           <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-sm font-bold">Est. Band {part1Data.score}</span>
                        </div>
                        <p className="text-slate-600 italic">"{part1Data.feedback}"</p>
                     </div>
                  )}

                  {/* Audio Player & Transcript Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {audioUrl && (
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-center">
                            <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                <span className="text-xl">🎧</span> Session Recording
                            </h3>
                            <audio controls src={audioUrl} className="w-full" />
                            <p className="text-xs text-slate-400 mt-2 text-center">Listen to identify your pauses and fillers</p>
                        </div>
                    )}
                    
                    {evaluationData.fluencyAnalysis && (
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                <span className="text-xl">📝</span> Speech Transcript
                            </h3>
                            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed text-sm bg-slate-50 rounded-lg border border-slate-100 p-4 h-40 overflow-y-auto custom-scrollbar">
                            {evaluationData.fluencyAnalysis.segments.map((seg, i) => {
                                if (seg.type === 'speech') return <span key={i} className="mr-1">{seg.text}</span>;
                                if (seg.type === 'filler') return <span key={i} className="text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded mr-1 border border-amber-200 text-xs uppercase tracking-wide">{seg.text}</span>;
                                if (seg.type === 'bad-pause') return <span key={i} className="text-rose-500 font-bold mr-1 tracking-widest text-xs bg-rose-50 px-1 rounded border border-rose-100">[...]</span>;
                                if (seg.type === 'good-pause') return <span key={i} className="text-slate-300 mr-2">|</span>;
                                return null;
                            })}
                            </div>
                        </div>
                    )}
                  </div>

                  {/* Fluency Visualizer */}
                  {evaluationData.fluencyAnalysis && (
                    <div className="space-y-4">
                      <h3 className="font-bold text-slate-800 text-lg">Visual Fluency Breakdown</h3>
                      <FluencyVisualizer segments={evaluationData.fluencyAnalysis.segments} />
                      <div className="grid grid-cols-3 gap-4">
                         <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-center">
                            <div className="text-2xl font-bold text-emerald-600">{evaluationData.fluencyAnalysis.goodPausesCount}</div>
                            <div className="text-xs text-emerald-800 font-medium uppercase">Natural Pauses</div>
                         </div>
                         <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-center">
                            <div className="text-2xl font-bold text-amber-600">{evaluationData.fluencyAnalysis.fillersCount}</div>
                            <div className="text-xs text-amber-800 font-medium uppercase">Fillers Detected</div>
                         </div>
                         <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg text-center">
                            <div className="text-2xl font-bold text-rose-600">{evaluationData.fluencyAnalysis.badPausesCount}</div>
                            <div className="text-xs text-rose-800 font-medium uppercase">Hesitations</div>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* Language Analysis Section (Grammar & Vocabulary) */}
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                              <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                  <span className="text-xl">✍️</span> Grammar Breakdown
                              </h3>
                              <span className="bg-white/80 px-3 py-1 rounded-lg text-indigo-700 font-bold text-sm shadow-sm">
                                  Band {evaluationData.grammar}
                              </span>
                          </div>
                          <div className="prose prose-sm prose-indigo text-slate-700 max-w-none">
                              <p className="whitespace-pre-line leading-relaxed">{evaluationData.grammarFeedback}</p>
                          </div>
                      </div>

                      <div className="bg-cyan-50/50 border border-cyan-100 rounded-2xl p-6 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                              <h3 className="font-bold text-cyan-900 flex items-center gap-2">
                                  <span className="text-xl">📖</span> Vocabulary Analysis
                              </h3>
                              <span className="bg-white/80 px-3 py-1 rounded-lg text-cyan-700 font-bold text-sm shadow-sm">
                                  Band {evaluationData.lexical}
                              </span>
                          </div>
                          <div className="prose prose-sm prose-cyan text-slate-700 max-w-none">
                               <p className="whitespace-pre-line leading-relaxed">{evaluationData.lexicalFeedback}</p>
                          </div>
                      </div>
                  </div>

                  {/* Other Scores Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {[
                       { 
                         label: 'Fluency & Coherence', 
                         score: evaluationData.fluency, 
                         feedback: evaluationData.fluencyFeedback,
                         color: 'border-emerald-200 bg-emerald-50/50 text-emerald-900' 
                       },
                       { 
                         label: 'Pronunciation (Est.)', 
                         score: evaluationData.pronunciation, 
                         feedback: evaluationData.pronunciationFeedback,
                         color: 'border-rose-200 bg-rose-50/50 text-rose-900' 
                       }
                     ].map((c) => (
                       <div key={c.label} className={`p-6 rounded-2xl border ${c.color} transition-all hover:shadow-md`}>
                          <div className="flex justify-between items-start mb-4">
                             <h4 className="font-bold text-lg flex items-center gap-2">
                               {c.label}
                             </h4>
                             <span className="text-2xl font-bold bg-white/60 px-3 py-1 rounded-lg backdrop-blur-sm">
                               {c.score}
                             </span>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                            {c.feedback}
                          </p>
                       </div>
                     ))}
                  </div>

                  {/* General Feedback Summary */}
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 text-lg">Koli's Summary</h3>
                    <p className="text-slate-600 leading-relaxed text-base">{evaluationData.feedback}</p>
                  </div>

                  <button 
                     onClick={handleBackToDashboard}
                     className="w-full py-4 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-lg transition-colors"
                  >
                    Back to Dashboard
                  </button>
               </div>
            ) : (
               <div className="text-red-500">Failed to load results.</div>
            )}
         </div>
      );
    }

    // Active Test UI
    return (
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto gap-4 p-2">
         {/* Top Bar */}
         <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
               <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`}></div>
               <span className="font-semibold text-slate-700">
                  {currentPart === TestPart.PART1 && "Part 1: Introduction"}
                  {currentPart === TestPart.PART2_PREP && "Part 2: Preparation"}
                  {currentPart === TestPart.PART2_SPEAKING && "Part 2: Long Turn"}
                  {currentPart === TestPart.PART3 && "Part 3: Discussion"}
               </span>
            </div>
            <button 
              onClick={handleFinishTest}
              className="text-xs font-bold text-rose-500 hover:bg-rose-50 px-3 py-1 rounded-lg transition-colors"
            >
              END SESSION
            </button>
         </div>

         <div className="flex flex-1 min-h-0 gap-4">
            {/* Left: Examiner / Cue Card */}
            <div className="flex-1 flex flex-col gap-4 h-full">
               {/* Examiner Visual */}
               <div className="relative bg-teal-900 rounded-3xl overflow-hidden shadow-lg shrink-0 h-48 flex items-center justify-center border-b-4 border-teal-600">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-900 to-slate-900 opacity-90"></div>
                  {/* Visualizer Overlay */}
                  <div className="absolute bottom-0 left-0 w-full h-full opacity-40">
                     <Visualizer 
                        isActive={isConnected} 
                        volume={volume} 
                        isModelSpeaking={isModelSpeaking}
                        fluencyFeedback={fluencyFeedback}
                     />
                  </div>
                  <div className="z-10 flex flex-col items-center">
                     <AvatarGlow isActive={isModelSpeaking}>
                        <div className={`w-20 h-20 rounded-full bg-white border-4 ${isModelSpeaking ? 'border-teal-400' : 'border-slate-200'} flex items-center justify-center transition-all duration-300 shadow-xl overflow-hidden`}>
                            <div className="text-4xl">🧕</div>
                        </div>
                     </AvatarGlow>
                     <span className="text-white font-bold text-lg tracking-wide mt-2">Koli</span>
                     <span className="text-teal-200 text-xs font-medium uppercase tracking-wider">AI Examiner</span>
                  </div>
               </div>

               {/* Dynamic Content Area - Scrollable */}
               <div className="flex-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {(currentPart === TestPart.PART2_PREP || currentPart === TestPart.PART2_SPEAKING) ? (
                     <div className="h-full flex flex-col overflow-y-auto pr-2">
                        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6 mb-4 flex-1 min-h-0">
                           <h3 className="text-sm font-bold text-amber-800 uppercase tracking-widest mb-4">Topic Card</h3>
                           <h2 className="text-xl font-bold text-slate-800 mb-4">{CUE_CARDS[cueCardIndex].title}</h2>
                           <ul className="space-y-3">
                              {CUE_CARDS[cueCardIndex].bullets.map((bullet, i) => (
                                <li key={i} className="flex items-start gap-2 text-slate-700">
                                  <span className="mt-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                                  {bullet}
                                </li>
                              ))}
                           </ul>
                        </div>
                        {currentPart === TestPart.PART2_PREP && (
                           <div className="text-center text-slate-500 text-sm py-2">
                             You have 1 minute to think. You can make notes.
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="h-full flex flex-col overflow-hidden">
                        <h3 className="font-semibold text-slate-400 text-xs uppercase tracking-widest mb-2 shrink-0">Transcript</h3>
                        <ChatHistory messages={messages} />
                     </div>
                  )}
               </div>
            </div>

            {/* Right: Controls & Timer - Sticky behavior via height constraint */}
            <div className="w-80 flex flex-col gap-4 overflow-y-auto pr-1">
               {/* Wrapper to allow sticky within this column if needed, though mostly items stack */}
               <div className="flex flex-col gap-4">
                 {currentPart === TestPart.PART1 && (
                    <Timer 
                      isActive={isConnected} 
                      durationSeconds={240} // 4 mins
                      label="Part 1 Timer" 
                      onComplete={handleNextPart} 
                    />
                 )}
                 {currentPart === TestPart.PART2_PREP && (
                    <Timer 
                      isActive={!isModelSpeaking} 
                      durationSeconds={60} 
                      label="Preparation Time"
                      onComplete={handleNextPart}
                    />
                 )}
                 {currentPart === TestPart.PART2_SPEAKING && (
                    <Timer 
                      isActive={!isModelSpeaking} 
                      durationSeconds={120} 
                      label="Speaking Time"
                      onComplete={handleNextPart}
                    />
                 )}
                 {currentPart === TestPart.PART3 && (
                    <Timer 
                      isActive={isConnected} 
                      durationSeconds={300} 
                      label="Part 3 Timer"
                      onComplete={handleFinishTest}
                    />
                 )}

                 {/* WPM Indicator */}
                 {(currentPart === TestPart.PART2_SPEAKING || currentPart === TestPart.PART3) && (
                   <div className={`p-4 rounded-xl border flex flex-col items-center justify-center transition-all ${
                      currentWPM < 90 ? 'bg-amber-50 border-amber-200' : 
                      currentWPM > 160 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
                   }`}>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Speaking Rate</div>
                      <div className="text-3xl font-bold tabular-nums text-slate-800">
                        {currentWPM} <span className="text-sm font-medium text-slate-500">wpm</span>
                      </div>
                      <div className={`text-xs mt-1 font-medium ${
                        currentWPM < 90 ? 'text-amber-600' : 
                        currentWPM > 160 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {currentWPM < 90 ? 'Too Slow' : currentWPM > 160 ? 'Too Fast' : 'Good Pace'}
                      </div>
                   </div>
                 )}

                 {/* Preliminary Part 1 Score Display */}
                 {part1Evaluation && (currentPart === TestPart.PART2_PREP || currentPart === TestPart.PART2_SPEAKING || currentPart === TestPart.PART3) && (
                   <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 shadow-sm animate-fade-in">
                      <div className="flex justify-between items-center mb-1">
                         <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">Part 1 Score (Est.)</span>
                         <span className="text-lg font-bold text-teal-600 bg-white px-2 rounded">{part1Evaluation.score}</span>
                      </div>
                      <p className="text-[11px] text-teal-700 leading-tight italic">"{part1Evaluation.feedback}"</p>
                   </div>
                 )}

                 <div className="flex-1 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs">i</span>
                      Tip from Koli
                    </h4>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {currentPart === TestPart.PART1 && "Relax and be yourself. I'm just getting to know you. Keep your answers natural."}
                      {currentPart === TestPart.PART2_PREP && "Use this minute wisely! Jot down keywords, not full sentences. Structure your story."}
                      {currentPart === TestPart.PART2_SPEAKING && "Keep speaking until I stop you! Don't worry about the time. Elaborate on your points."}
                      {currentPart === TestPart.PART3 && "This is where we discuss ideas. Give reasons and examples for your opinions."}
                    </p>
                 </div>

                 <button
                   onClick={handleNextPart}
                   className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-lg transition-all"
                 >
                   Next Step →
                 </button>
               </div>
            </div>
         </div>
      </div>
    );
  };

  return (
    // Fixed viewport height to allow internal scrolling zones
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header - Sticky */}
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-center px-6 shrink-0 z-50 sticky top-0">
         <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center border border-teal-200 text-lg shadow-sm">🧕</div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">Hey<span className="text-teal-600">Koli</span></h1>
         </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
         {/* Error Banner */}
         {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-100 border border-rose-400 text-rose-800 px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-fade-in-down">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               <span className="text-sm font-medium">{error}</span>
            </div>
         )}
         {renderContent()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-400 z-20 shrink-0">
          Made with ❤️ by <a href="https://salmahoquekoli.com/" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-700 font-medium hover:underline">Salma Hoque Koli</a>
      </footer>
    </div>
  );
};

export default App;
