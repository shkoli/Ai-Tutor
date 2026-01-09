
import React, { useEffect, useState, useRef } from 'react';

// Custom hook to manage timer logic independently
export const useTimer = (durationSeconds: number, isActive: boolean, onComplete?: () => void) => {
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setTimeLeft(durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) return 0;
        
        const newValue = prev - 1;
        
        if (newValue === 0) {
          onCompleteRef.current?.();
        }
        
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  return timeLeft;
};

interface TimerProps {
  durationSeconds: number;
  onComplete?: () => void;
  isActive: boolean;
  label?: string;
}

export const Timer: React.FC<TimerProps> = ({ durationSeconds, onComplete, isActive, label }) => {
  const timeLeft = useTimer(durationSeconds, isActive, onComplete);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  const totalDuration = Math.max(durationSeconds, 1);
  const elapsed = totalDuration - timeLeft;
  const progress = (elapsed / totalDuration) * 100;

  const isUrgent = timeLeft < 60 && isActive && timeLeft > 0; // Urgent if less than 1 minute

  return (
    <div className="flex flex-col p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm w-full relative overflow-hidden group">
      {/* Background visual flair */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-16 -mt-16 opacity-40 blur-2xl group-hover:bg-teal-100 transition-colors"></div>

      <div className="flex items-center justify-between w-full mb-6 relative z-10">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">{label || 'Session Timer'}</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-teal-600' : 'text-slate-400'}`}>
              {isActive ? 'Live Session' : 'Standby'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-black tracking-tight tabular-nums transition-colors duration-300 ${isUrgent ? 'text-rose-500' : 'text-slate-800'}`}>
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden z-10">
        {/* Subtle grid on progress bar */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><pattern id="grid-timer" width="10" height="10" patternUnits="userSpaceOnUse"><line x1="10" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="0.5"/></pattern><rect width="100%" height="100%" fill="url(#grid-timer)" /></svg>
        </div>
        
        <div 
          className={`h-full transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(20,184,166,0.3)] ${isUrgent ? 'bg-rose-500' : 'bg-teal-500'}`}
          style={{ width: `${Math.min(100, progress)}%` }}
        >
          {/* Shine effect */}
          <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center relative z-10">
        <div className="flex gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div 
              key={i} 
              className={`w-1 h-3 rounded-full transition-colors ${ (progress / 8.33) > i ? (isUrgent ? 'bg-rose-200' : 'bg-teal-200') : 'bg-slate-100'}`}
            ></div>
          ))}
        </div>
        <span className="text-[10px] font-bold text-slate-400 tabular-nums uppercase tracking-widest">
          {Math.floor(progress)}% Complete
        </span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
};
