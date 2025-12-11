import React from 'react';
import { Language, ConnectionState } from '../types';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onSelect: (lang: Language) => void;
  connectionState: ConnectionState;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  selectedLanguage, 
  onSelect, 
  connectionState 
}) => {
  const isDisabled = connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING;

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <label className="text-sm font-medium text-slate-400">Target Language</label>
      <div className="relative">
        <select
          value={selectedLanguage}
          onChange={(e) => onSelect(e.target.value as Language)}
          disabled={isDisabled}
          className={`w-full appearance-none bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-4 py-3 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors
            ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-500 cursor-pointer'}
          `}
        >
          {Object.values(Language).map((lang: string) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {isDisabled && (
        <p className="text-xs text-slate-500">Disconnect to change language</p>
      )}
    </div>
  );
};