
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { ConnectionState, TestPart, BandScore, Part1Evaluation, TestResult } from './types';
import { useGeminiLive } from './hooks/useGeminiLive';
import { Visualizer } from './components/Visualizer';
import { ChatHistory } from './components/ChatHistory';
import { Timer } from './components/Timer';
import { AvatarGlow } from './components/AvatarGlow';
import { analyzeFluency } from './utils/fluencyUtils';
import { CUE_CARDS, PART1_TOPICS, SYSTEM_INSTRUCTIONS } from './utils/ieltsData';
import { getHistory, saveTestResult, clearHistory, deleteTestResult, getUsedCueCardIds, markCueCardAsUsed, clearUsedQuestions, saveAudioToDB, getAudioFromDB } from './utils/storageUtils';

const App: React.FC = () => {
  const [currentPart, setCurrentPart] = useState<TestPart>(TestPart.IDLE);
  const [cueCardIndex, setCueCardIndex] = useState(0);
  const [bandScore, setBandScore] = useState<BandScore | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [history, setHistory] = useState<TestResult[]>([]);
  const [viewingResult, setViewingResult] = useState<TestResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sessionInstructions, setSessionInstructions] = useState(SYSTEM_INSTRUCTIONS.EXAMINER);

  const { 
    connectionState, 
    connect, 
    disconnect, 
    volume, 
    isModelSpeaking, 
    messages,
    error,
    fluencyFeedback,
    userTranscript
  } = useGeminiLive({ systemInstruction: sessionInstructions });

  const isConnected = connectionState === ConnectionState.CONNECTED;

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleOpenKeySelection = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      window.location.reload();
    }
  };

  const handleStartTest = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        window.location.reload();
        return;
      }
    }

    const shuffledTopics = [...PART1_TOPICS].sort(() => 0.5 - Math.random());
    const usedIds = getUsedCueCardIds();
    const pool = CUE_CARDS.filter(card => !usedIds.includes(card.id));
    const selectedCard = (pool.length > 0 ? pool : CUE_CARDS)[Math.floor(Math.random() * (pool.length || CUE_CARDS.length))];
    
    setCueCardIndex(CUE_CARDS.findIndex(c => c.id === selectedCard.id));
    markCueCardAsUsed(selectedCard.id);

    setSessionInstructions(`${SYSTEM_INSTRUCTIONS.EXAMINER}\n\nTOPICS: ${shuffledTopics.slice(0, 3).join(', ')}\nCUE CARD: ${selectedCard.title}`);
    
    setCurrentPart(TestPart.PART1);
    setBandScore(null);
    setViewingResult(null);
    connect();
  };

  const handleFinishTest = async () => {
    setCurrentPart(TestPart.EVALUATION);
    setIsEvaluating(true);
    const audioBlob = await disconnect();
    
    let audioId = undefined;
    if (audioBlob) {
        audioId = await saveAudioToDB(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const transcript = messages.map(m => `${m.role}: ${m.text}`).join('\n');
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Act as IELTS Examiner. Evaluate transcript:\n${transcript}`,
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
      const finalScore: BandScore = { ...scoreData, audioStorageId: audioId, fluencyAnalysis: analyzeFluency(transcript) };
      setBandScore(finalScore);
      setHistory(saveTestResult({ ...finalScore, id: Date.now().toString(), timestamp: Date.now(), topic: CUE_CARDS[cueCardIndex].title }));
    } catch (e) {
      console.error("Evaluation failed", e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const renderContent = () => {
    if (currentPart === TestPart.IDLE) {
      return (
        <div className="flex flex-col items-center h-full w-full max-w-4xl mx-auto p-4 overflow-y-auto pt-12">
           <div className="flex flex-col items-center text-center space-y-6 mb-12 animate-fade-in">
             <div className="w-24 h-24 bg-teal-50 rounded-full flex items-center justify-center p-2 ring-4 ring-teal-100 shadow-lg">
               <div className="text-5xl">🧕</div>
             </div>
             <div>
               <h2 className="text-4xl font-black text-slate-800 tracking-tight">Meet <span className="text-teal-600">HeyKoli</span></h2>
               <p className="text-slate-500 mt-2 max-w-md mx-auto text-lg">Your high-performance AI examiner for IELTS Speaking mastery.</p>
             </div>
             <button 
               onClick={handleStartTest}
               className="px-10 py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-full font-bold text-lg shadow-xl shadow-teal-200 transition-all transform hover:-translate-y-1"
             >
               Start Test Session
             </button>
           </div>

           <div className="w-full max-w-2xl">
             <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Practice Records</h3>
                {history.length > 0 && <button onClick={() => { clearHistory(); setHistory([]); }} className="text-[10px] text-rose-500 font-bold uppercase tracking-widest hover:underline">Clear History</button>}
             </div>
             <div className="space-y-3">
               {history.length === 0 ? (
                 <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-200 p-12 text-center text-slate-400 font-medium">No sessions yet. Let's start practicing!</div>
               ) : history.map((item) => (
                 <div key={item.id} onClick={() => { setBandScore(item); setViewingResult(item); setCurrentPart(TestPart.EVALUATION); }} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer flex items-center justify-between transition-all group">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-sm ${item.overall >= 7 ? 'bg-emerald-500' : 'bg-amber-500'}`}>{item.overall}</div>
                      <div>
                        <div className="font-bold text-slate-800 line-clamp-1">{item.topic}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                      </div>
                    </div>
                    <div className="text-teal-500 opacity-0 group-hover:opacity-100 font-black text-[10px] tracking-widest">DETAILS →</div>
                 </div>
               ))}
             </div>
           </div>
        </div>
      );
    }

    if (currentPart === TestPart.EVALUATION) {
      const data = isEvaluating ? null : (viewingResult || bandScore);
      return (
         <div className="flex flex-col items-center h-full w-full max-w-4xl mx-auto p-4 overflow-y-auto">
            <div className="flex items-center justify-between w-full mb-8 pt-4">
               <h2 className="text-2xl font-black text-slate-800 tracking-tight">Session Analysis</h2>
               <button onClick={() => { setCurrentPart(TestPart.IDLE); setViewingResult(null); }} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 font-bold text-sm transition-colors">Return to Dashboard</button>
            </div>
            {isEvaluating ? (
               <div className="flex flex-col items-center space-y-4 my-24">
                 <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                 <p className="text-slate-600 font-black uppercase tracking-widest text-[10px]">Processing Language Engine...</p>
               </div>
            ) : data ? (
               <div className="w-full space-y-8 pb-20">
                  <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] flex items-center justify-between shadow-2xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500 opacity-10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                     <div className="relative z-10">
                       <div className="text-teal-400 text-[10px] uppercase tracking-[0.3em] font-black mb-2">Estimated IELTS Band</div>
                       <div className="text-8xl font-black">{data.overall}</div>
                     </div>
                     <div className="text-right z-10">
                       <div className="text-xs opacity-50 font-black uppercase tracking-widest mb-2">Fluency & Coherence</div>
                       <div className="text-3xl font-black text-teal-400">Band {data.fluency}</div>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-indigo-50/50 p-8 rounded-[2rem] border border-indigo-100/50 flex flex-col h-full">
                          <h3 className="font-black text-indigo-900 text-xs uppercase tracking-[0.2em] mb-4 flex justify-between">Grammar Analysis <span>{data.grammar}</span></h3>
                          <p className="text-sm text-indigo-950/70 leading-relaxed whitespace-pre-line flex-1">{data.grammarFeedback}</p>
                      </div>
                      <div className="bg-emerald-50/50 p-8 rounded-[2rem] border border-emerald-100/50 flex flex-col h-full">
                          <h3 className="font-black text-emerald-900 text-xs uppercase tracking-[0.2em] mb-4 flex justify-between">Lexical Resource <span>{data.lexical}</span></h3>
                          <p className="text-sm text-emerald-950/70 leading-relaxed whitespace-pre-line flex-1">{data.lexicalFeedback}</p>
                      </div>
                      <div className="bg-amber-50/50 p-8 rounded-[2rem] border border-amber-100/50 flex flex-col h-full">
                          <h3 className="font-black text-amber-900 text-xs uppercase tracking-[0.2em] mb-4 flex justify-between">Fluency Breakdown <span>{data.fluency}</span></h3>
                          <p className="text-sm text-amber-950/70 leading-relaxed whitespace-pre-line flex-1">{data.fluencyFeedback}</p>
                      </div>
                      <div className="bg-rose-50/50 p-8 rounded-[2rem] border border-rose-100/50 flex flex-col h-full">
                          <h3 className="font-black text-rose-900 text-xs uppercase tracking-[0.2em] mb-4 flex justify-between">Pronunciation Est. <span>{data.pronunciation}</span></h3>
                          <p className="text-sm text-rose-950/70 leading-relaxed whitespace-pre-line flex-1">{data.pronunciationFeedback}</p>
                      </div>
                  </div>

                  {audioUrl && (
                    <div className="bg-teal-50 p-8 rounded-[2.5rem] border border-teal-100 flex flex-col items-center gap-4 shadow-sm">
                      <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Listen to Recording</span>
                      <audio controls src={audioUrl} className="w-full max-w-lg h-10" />
                    </div>
                  )}

                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl font-black">"</div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Examiner's Summary</h3>
                    <p className="text-slate-700 italic font-medium text-lg leading-relaxed relative z-10">{data.feedback}</p>
                  </div>
               </div>
            ) : null}
         </div>
      );
    }

    return (
      <div className="flex flex-col h-full w-full max-w-6xl mx-auto p-4 gap-6">
         <div className="flex items-center justify-between bg-white px-8 py-4 rounded-3xl shadow-sm border border-slate-100 shrink-0">
            <div className="flex items-center gap-4">
               <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.6)]' : 'bg-slate-300'}`}></div>
               <span className="font-black text-slate-800 text-xs tracking-[0.2em] uppercase">Session Active</span>
            </div>
            <button onClick={handleFinishTest} className="px-6 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors">Finish Session</button>
         </div>

         <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6 h-full min-h-0">
               <div className="relative bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl h-64 shrink-0 flex items-center justify-center border-b-[6px] border-teal-600">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-900 to-slate-900 opacity-90"></div>
                  <div className="absolute bottom-0 left-0 w-full h-full opacity-40">
                     <Visualizer isActive={isConnected} volume={volume} isModelSpeaking={isModelSpeaking} fluencyFeedback={fluencyFeedback} />
                  </div>
                  <div className="z-10 flex flex-col items-center">
                     <AvatarGlow isActive={isModelSpeaking}>
                        <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-2xl border-4 border-teal-500/20">
                            <div className="text-5xl">🧕</div>
                        </div>
                     </AvatarGlow>
                     <span className="text-white font-black text-xl tracking-tight mt-4 uppercase tracking-[0.1em]">Koli</span>
                  </div>
               </div>
               <div className="flex-1 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <h3 className="font-black text-slate-300 text-[10px] uppercase tracking-[0.4em] mb-6 shrink-0">Live Transcript</h3>
                  <ChatHistory messages={messages} />
               </div>
            </div>
            <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
                <Timer isActive={isConnected} durationSeconds={900} label="Exam Progress" onComplete={handleFinishTest} />
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Topic Context</h4>
                   <p className="text-sm text-slate-700 font-bold leading-relaxed">{CUE_CARDS[cueCardIndex].title}</p>
                   <ul className="mt-4 space-y-2">
                     {CUE_CARDS[cueCardIndex].bullets.map((b, i) => (
                       <li key={i} className="text-xs text-slate-500 flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>{b}
                       </li>
                     ))}
                   </ul>
                </div>
                <div className="flex-1 bg-teal-600 p-8 rounded-[2.5rem] text-white flex flex-col justify-end shadow-xl shadow-teal-100 relative overflow-hidden">
                   <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Practice Advice</h4>
                   <p className="text-lg font-bold leading-tight">Focus on grammar range and accuracy. Koli is listening for complex structures!</p>
                </div>
            </div>
         </div>
      </div>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0 z-50">
         <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 flex items-center justify-center text-2xl shadow-xl shadow-teal-100">🧕</div>
            <h1 className="font-black text-2xl tracking-tighter text-slate-800">Hey<span className="text-teal-600">Koli</span></h1>
         </div>
         <div className="flex items-center gap-3">
           <div className="hidden lg:flex flex-col items-end border-r border-slate-200 pr-6 mr-6">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Global IELTS Coach</span>
             <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest bg-teal-50 px-2 py-0.5 rounded border border-teal-100">Platform Active</span>
           </div>
           <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[11px] font-black text-slate-800 tracking-tight leading-none">Salma Hoque Koli</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Personal Coach</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs font-black text-teal-600 shadow-sm">SHK</div>
           </div>
         </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
         {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] bg-white border-2 border-rose-500 p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 animate-fade-in-down max-w-lg text-center">
               <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-3xl font-black text-rose-500">!</div>
               <div className="space-y-2">
                 <h3 className="font-black text-xl text-slate-800">Billing Project Required</h3>
                 <p className="text-sm font-medium text-slate-600">
                    {error === "BILLING_REQUIRED" 
                      ? "Koli's real-time voice engine requires an API Key from a paid Google Cloud project. You can upgrade for free to get access." 
                      : error}
                 </p>
               </div>
               <div className="flex flex-col gap-3 w-full pt-4">
                 <button onClick={handleOpenKeySelection} className="bg-rose-500 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-rose-600 transition-colors">Select Paid API Key</button>
                 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-xs font-bold text-teal-600 underline py-2">How to link billing to your project</a>
                 <button onClick={() => window.location.reload()} className="text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 mt-2">Dismiss & Retry</button>
               </div>
            </div>
         )}
         {renderContent()}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-10 flex justify-between items-center shrink-0">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">HeyKoli AI Platform v2.7 • Multimodal IELTS Examiner</p>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest underline decoration-teal-500/30 underline-offset-4 decoration-2">Created by Salma Hoque Koli</p>
      </footer>
    </div>
  );
};

export default App;
