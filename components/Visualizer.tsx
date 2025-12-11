import React, { useEffect, useRef } from 'react';
import { FluencyFeedback } from '../types';

interface VisualizerProps {
  isActive: boolean;
  volume: number; // 0 to 1
  isModelSpeaking: boolean;
  fluencyFeedback?: FluencyFeedback;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, volume, isModelSpeaking, fluencyFeedback = 'neutral' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
         // Idle state: straight line or gentle pulse
         ctx.beginPath();
         ctx.moveTo(0, centerY);
         ctx.lineTo(width, centerY);
         ctx.strokeStyle = '#334155'; // Slate 700
         ctx.lineWidth = 2;
         ctx.stroke();
         return;
      }

      // Determine color based on feedback state or speaker
      let color = '#a78bfa'; // Default User (Violet)
      
      if (isModelSpeaking) {
        color = '#38bdf8'; // Model (Sky Blue)
      } else {
        if (fluencyFeedback === 'bad') {
          color = '#f43f5e'; // Bad/Filler (Rose)
        } else if (fluencyFeedback === 'good') {
          color = '#10b981'; // Good Pause (Emerald)
        }
      }

      const baseAmplitude = isModelSpeaking ? 40 : (volume * 100); 
      
      ctx.beginPath();
      ctx.moveTo(0, centerY);

      // Draw sine wave
      for (let x = 0; x < width; x++) {
        // Create a wave that moves with time and varies amplitude based on volume/speaking
        const y = centerY + Math.sin(x * 0.05 + time) * baseAmplitude * Math.sin(x * 0.01 + time * 0.5);
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.shadowBlur = fluencyFeedback !== 'neutral' ? 20 : 10;
      ctx.shadowColor = color;
      ctx.stroke();
      ctx.shadowBlur = 0;

      time += 0.2;
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, volume, isModelSpeaking, fluencyFeedback]);

  return (
    <div className="w-full h-32 bg-slate-800/50 rounded-xl overflow-hidden backdrop-blur-sm border border-slate-700/50 transition-colors duration-300">
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={128} 
        className="w-full h-full"
      />
    </div>
  );
};