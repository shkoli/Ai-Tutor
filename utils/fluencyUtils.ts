import { FluencyAnalysis, FluencySegment } from '../types';

// Heuristic based fluency analyzer
export function analyzeFluency(transcript: string): FluencyAnalysis {
  const segments: FluencySegment[] = [];
  let fillersCount = 0;
  let badPausesCount = 0;
  let goodPausesCount = 0;

  // Expanded fillers list
  const FILLERS = /\b(um|uh|er|ah|like|you know|i mean|basically|actually|literally|sort of|kind of)\b/i;
  
  // Regex to split by spaces, punctuation, but keep the delimiters
  // This helps us analyze the flow accurately
  const tokens = transcript.split(/(\s+|(?=[,.!?])|(?<=[,.!?]))/).filter(t => t.trim().length > 0);

  let currentPhrase = "";
  let lastWord = "";

  tokens.forEach((token, index) => {
    const cleanToken = token.trim();
    const lowerToken = cleanToken.toLowerCase();

    // 1. Detect Fillers
    if (FILLERS.test(cleanToken)) {
      if (currentPhrase) {
        segments.push({ type: 'speech', text: currentPhrase, duration: currentPhrase.length });
        currentPhrase = "";
      }
      segments.push({ type: 'filler', text: cleanToken, duration: 2 });
      fillersCount++;
      lastWord = lowerToken;
      return;
    }

    // 2. Detect Stuttering / Repetition (e.g., "I I I think")
    // If the current word is the same as the last word (and short, to avoid "had had"), mark as hesitation
    if (lowerToken === lastWord && lowerToken.length < 5 && !['had', 'that'].includes(lowerToken)) {
       if (currentPhrase) {
        segments.push({ type: 'speech', text: currentPhrase, duration: currentPhrase.length });
        currentPhrase = "";
       }
       segments.push({ type: 'bad-pause', duration: 1 }); // Visual hesitation block
       segments.push({ type: 'speech', text: cleanToken, duration: cleanToken.length });
       badPausesCount++;
       lastWord = lowerToken;
       return;
    }

    // 3. Detect Pauses based on punctuation
    if ([',', '.', '!', '?', ';'].includes(cleanToken)) {
       if (currentPhrase) {
         segments.push({ type: 'speech', text: currentPhrase, duration: currentPhrase.length });
         currentPhrase = "";
       }
       
       // Heuristic: Punctuation usually indicates a "Good" grammatical pause
       segments.push({ type: 'good-pause', duration: 1 });
       goodPausesCount++;
       lastWord = ""; // Reset last word tracking on sentence boundary
    } else {
      // It's a regular word
      currentPhrase += (currentPhrase ? " " : "") + cleanToken;
      lastWord = lowerToken;
      
      // Heuristic: Insert "Bad Pauses" for very long phrases without punctuation 
      // This simulates "running out of breath" or getting lost in a sentence
      const currentWordCount = currentPhrase.split(' ').length;
      if (currentWordCount > 18) {
         segments.push({ type: 'speech', text: currentPhrase, duration: currentPhrase.length });
         segments.push({ type: 'bad-pause', duration: 2 });
         badPausesCount++;
         currentPhrase = "";
      }
    }
  });

  // Push remaining text
  if (currentPhrase) {
    segments.push({ type: 'speech', text: currentPhrase, duration: currentPhrase.length });
  }

  return {
    segments,
    fillersCount,
    badPausesCount,
    goodPausesCount
  };
}