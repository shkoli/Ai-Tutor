
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
  
  // Adjusted radius for larger circle
  const radius = 110; 
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (elapsed / totalDuration);

  const isUrgent = timeLeft < 10 && isActive && timeLeft > 0;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-teal-50/50 w-full relative overflow-hidden group">
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 w-full h-1.5 transition-colors duration-500 ${isActive ? 'bg-gradient-to-r from-teal-400 to-emerald-500' : 'bg-slate-200'}`}></div>
      
      {label && (
        <div className="flex items-center gap-2 mb-6 w-full px-2">
            <span className={`w-2 h-2 rounded-full transition-colors ${isActive ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`}></span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
        </div>
      )}
      
      {/* Container resized to w-64 h-64 (approx 256px) */}
      <div className={`relative w-64 h-64 flex items-center justify-center mb-2 ${isUrgent ? 'animate-pulse' : ''}`}>
        {/* Updated viewBox for larger coordinate system */}
        <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 240 240">
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0d9488" />
                <stop offset="50%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#14b8a6" />
                <animateTransform
                    attributeName="gradientTransform"
                    type="rotate"
                    from="0 0.5 0.5"
                    to="360 0.5 0.5"
                    dur="3s"
                    repeatCount="indefinite"
                />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Track - centered at 120, 120 */}
          <circle
            cx="120"
            cy="120"
            r={radius}
            stroke="#f1f5f9"
            strokeWidth="10"
            fill="transparent"
          />
          {/* Progress Indicator */}
          <circle
            cx="120"
            cy="120"
            r={radius}
            stroke={isUrgent ? '#f43f5e' : "url(#timerGradient)"}
            strokeWidth="10"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-linear"
            filter={isUrgent ? 'none' : 'url(#glow)'}
          />
        </svg>

        {/* Digital Display - kept relatively smaller to emphasize circle */}
        <div className="flex flex-col items-center justify-center z-10">
          <div className={`text-5xl font-mono font-bold tracking-tighter tabular-nums transition-colors duration-300 ${isUrgent ? 'text-rose-500' : 'text-slate-800'}`}>
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded-full transition-colors ${isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400'}`}>
             {isActive ? (timeLeft > 0 ? 'Running' : 'Complete') : 'Paused'}
          </span>
        </div>
      </div>

      {/* Elapsed Bar */}
      <div className="mt-6 w-full px-2">
         <div className="flex justify-between w-full items-center mb-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Elapsed Time</span>
            <span className="text-xs font-mono font-medium text-slate-600 tabular-nums">
                {Math.floor(elapsed / 60)}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}
            </span>
         </div>
         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
                className={`h-full transition-all duration-1000 ease-linear ${isUrgent ? 'bg-rose-400' : 'bg-teal-400'}`}
                style={{ width: `${Math.min(100, (elapsed / totalDuration) * 100)}%` }}
            ></div>
         </div>
      </div>
    </div>
  );
};
