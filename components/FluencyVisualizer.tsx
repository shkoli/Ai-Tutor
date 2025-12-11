import React, { useEffect, useRef } from 'react';
import { FluencySegment } from '../types';

interface FluencyVisualizerProps {
  segments: FluencySegment[];
}

export const FluencyVisualizer: React.FC<FluencyVisualizerProps> = ({ segments }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-wrap gap-2">
        <h4 className="font-bold text-slate-700 text-sm">Fluency Analysis</h4>
        <div className="flex gap-4 text-xs">
           <div className="flex items-center gap-1">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></div>
             <span className="text-slate-600">Good Pause</span>
           </div>
           <div className="flex items-center gap-1">
             <div className="w-2.5 h-2.5 bg-rose-500 rounded-sm shadow-sm"></div>
             <span className="text-slate-600">Bad Pause/Stutter</span>
           </div>
           <div className="flex items-center gap-1">
             <div className="w-2.5 h-2.5 bg-amber-400 rounded-sm shadow-sm"></div>
             <span className="text-slate-600">Filler</span>
           </div>
        </div>
      </div>
      
      {/* Waveform / Timeline Visualization */}
      <div 
        ref={scrollRef}
        className="p-8 overflow-x-auto whitespace-nowrap bg-white relative"
      >
         {/* Background Guide Lines */}
         <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-5">
            <div className="h-1/2 border-b border-slate-900 w-full"></div>
         </div>

        <div className="flex items-center h-16 relative">
           {/* Center Axis */}
           <div className="absolute top-1/2 left-0 w-full h-[1px] bg-slate-200 -z-10"></div>
           
           {segments.map((seg, i) => {
             if (seg.type === 'speech') {
               // Render "Audio Waveform" approximation for speech
               return (
                 <div key={i} className="flex items-center mx-[2px] group relative hover:bg-slate-50 rounded">
                   {/* Tooltip */}
                   <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-normal max-w-[150px] text-center">
                     {seg.text}
                   </div>
                   {/* Fake waveform bars */}
                   <div className="flex gap-[1px] items-center">
                     {Array.from({ length: Math.min(Math.ceil((seg.duration || 5) / 3), 15) }).map((_, j) => (
                       <div 
                         key={j} 
                         className="w-[3px] bg-slate-300 rounded-full group-hover:bg-teal-400 transition-colors"
                         style={{ height: `${Math.max(8, Math.random() * 32 + 8)}px` }}
                       ></div>
                     ))}
                   </div>
                 </div>
               );
             } 
             
             if (seg.type === 'good-pause') {
               return (
                 <div key={i} className="mx-3 flex flex-col items-center justify-center relative group">
                    <div className="w-5 h-5 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center z-10 shadow-sm transform group-hover:scale-110 transition-transform">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    </div>
                    {/* Connection Line */}
                    <div className="absolute h-[2px] w-[200%] bg-emerald-200 -z-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 </div>
               );
             }

             if (seg.type === 'bad-pause') {
                return (
                 <div key={i} className="mx-2 flex flex-col items-center justify-center relative group">
                    <div className="w-4 h-8 bg-rose-500 rounded flex items-center justify-center z-10 shadow-md border border-rose-600 transform group-hover:scale-110 transition-transform">
                       <span className="text-[8px] text-white font-bold">!</span>
                    </div>
                    <div className="absolute top-full mt-2 text-[10px] text-rose-600 font-bold opacity-0 group-hover:opacity-100 bg-rose-50 px-2 py-1 rounded border border-rose-200">Hesitation</div>
                 </div>
               );
             }

             if (seg.type === 'filler') {
                return (
                 <div key={i} className="mx-1 flex flex-col items-center justify-center relative group">
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] rounded border border-amber-300 font-bold z-10 hover:bg-amber-200 transition-colors cursor-help">
                      {seg.text}
                    </span>
                 </div>
               );
             }

             return null;
           })}
        </div>
      </div>
    </div>
  );
};