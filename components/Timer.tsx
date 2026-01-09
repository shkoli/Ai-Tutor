
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
  
  // Refined radius for the circle
  const radius = 90; 
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (elapsed / totalDuration);

  const isUrgent = timeLeft < 10 && isActive && timeLeft > 0;

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm w-full relative overflow-hidden group">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <svg width="100%" height="100%"><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="1"/></pattern><rect width="100%" height="100%" fill="url(#grid)" /></svg>
      </div>

      {label && (
        <div className="flex items-center justify-between w-full mb-8 relative z-10 px-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</span>
            <div className={`w-2 h-2 rounded-full transition-colors ${isActive ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`}></div>
        </div>
      )}
      
      {/* Circle Container */}
      <div className={`relative w-48 h-48 flex items-center justify-center ${isUrgent ? 'animate-pulse' : ''}`}>
        <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>
          </defs>

          {/* Background Ring */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            stroke="#f1f5f9"
            strokeWidth="8"
            fill="transparent"
          />
          
          {/* Progress Ring */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            stroke={isUrgent ? '#f43f5e' : "url(#timerGradient)"}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-linear"
          />
        </svg>

        {/* Time Display */}
        <div className="flex flex-col items-center justify-center z-10">
          <div className={`text-4xl font-black tracking-tight tabular-nums transition-colors duration-300 ${isUrgent ? 'text-rose-500' : 'text-slate-800'}`}>
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </div>
          <div className={`text-[9px] font-black uppercase tracking-widest mt-1 opacity-40 ${isActive ? 'text-teal-600' : 'text-slate-400'}`}>
            {isActive ? 'Live' : 'Ready'}
          </div>
        </div>
      </div>

      {/* Progress Stats */}
      <div className="mt-8 w-full px-2 relative z-10">
         <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest">Elapsed</span>
            <span className="text-xs font-bold text-slate-600 tabular-nums">
                {Math.floor(elapsed / 60)}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}
            </span>
         </div>
         <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <div 
                className={`h-full transition-all duration-1000 ease-linear ${isUrgent ? 'bg-rose-500' : 'bg-teal-500'}`}
                style={{ width: `${Math.min(100, (elapsed / totalDuration) * 100)}%` }}
            ></div>
         </div>
      </div>
    </div>
  );
};
