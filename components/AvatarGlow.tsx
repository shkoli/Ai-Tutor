import React from 'react';

interface AvatarGlowProps {
  isActive: boolean;
  children: React.ReactNode;
}

export const AvatarGlow: React.FC<AvatarGlowProps> = ({ isActive, children }) => {
  return (
    <div className="relative flex items-center justify-center">
      {isActive && (
        <>
          {/* Soft base glow */}
          <div className="absolute inset-0 rounded-full bg-teal-400/20 blur-xl animate-pulse"></div>
          
          {/* Inner ripple */}
          <div className="absolute inset-0 rounded-full border-2 border-teal-400/40 opacity-0 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
          
          {/* Outer ripple (delayed) */}
          <div className="absolute inset-0 rounded-full border border-teal-300/30 opacity-0 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_700ms]"></div>
        </>
      )}
      <div className={`relative z-10 transition-transform duration-300 ease-out ${isActive ? 'scale-105' : 'scale-100'}`}>
        {children}
      </div>
    </div>
  );
};
