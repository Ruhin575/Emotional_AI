import React, { useState } from 'react';
import { SocialAnalysis, Lens } from '../types';
import { generateSpeech } from '../services/gemini';

interface Props {
  analysis: SocialAnalysis;
}

const LensHeatMapCard: React.FC<{ lens: Lens }> = ({ lens }) => {
  // Determine color and opacity based on probability/risk
  const getVisualStyles = (prob: number, risk: number) => {
    // Opacity based on probability (0.2 to 1.0)
    const opacity = Math.max(0.2, prob);
    
    // Color based on Risk (Low: Green/Blue, Med: Yellow/Orange, High: Red/Purple)
    if (risk <= 3) return { bg: `rgba(74, 222, 128, ${opacity})`, border: 'border-green-300', text: 'text-green-900', icon: '😊' }; // Green
    if (risk <= 6) return { bg: `rgba(250, 204, 21, ${opacity})`, border: 'border-yellow-300', text: 'text-yellow-900', icon: '🤔' }; // Yellow
    if (risk <= 8) return { bg: `rgba(251, 146, 60, ${opacity})`, border: 'border-orange-300', text: 'text-orange-900', icon: '😬' }; // Orange
    return { bg: `rgba(248, 113, 113, ${opacity})`, border: 'border-red-300', text: 'text-red-900', icon: '🚨' }; // Red
  };

  const styles = getVisualStyles(lens.prob, lens.risk);

  return (
    <div 
      className={`relative rounded-xl border-2 ${styles.border} p-4 flex flex-col items-center justify-center text-center transition-all hover:scale-105`}
      style={{ backgroundColor: styles.bg }}
      role="img"
      aria-label={`Lens: ${lens.name}. Probability: ${Math.round(lens.prob * 100)}%. Risk Level: ${lens.risk}.`}
      title={lens.meaning} // Simple tooltip for context if absolutely needed
    >
       <span className="text-3xl mb-1 filter drop-shadow-sm" role="presentation">{styles.icon}</span>
       <h4 className={`font-bold text-sm leading-tight ${styles.text}`}>{lens.name}</h4>
       {/* Visual Intensity Bar (Alternative to number) */}
       <div className="w-full h-1.5 bg-white/40 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-white/80" style={{ width: `${lens.prob * 100}%` }}></div>
       </div>
    </div>
  );
};

export const AnalysisResult: React.FC<Props> = ({ analysis }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [feedback, setFeedback] = useState<'helpful' | 'not-helpful' | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [copiedTrans, setCopiedTrans] = useState(false);

  const playSummary = async () => {
    setIsPlaying(true);
    try {
      const textToRead = `Here is your insight. ${analysis.nt_translation}. Risk Level: ${analysis.overall_risk}`;
      
      const audioBase64 = await generateSpeech(textToRead);
      const binaryString = atob(audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const dataInt16 = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(dataInt16.length);
      for (let i = 0; i < dataInt16.length; i++) {
        float32Data[i] = dataInt16[i] / 32768.0;
      }
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 24000 });
      const buffer = audioCtx.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.onended = () => { setIsPlaying(false); audioCtx.close(); };
      source.start();

    } catch (e) {
      console.error("Error playing audio:", e);
      setIsPlaying(false);
    }
  };

  const submitFeedback = () => {
    setFeedbackSubmitted(true);
  };

  const copyTranslation = () => {
    navigator.clipboard.writeText(analysis.nt_translation);
    setCopiedTrans(true);
    setTimeout(() => setCopiedTrans(false), 2000);
  }

  const getOverallRiskStyles = (risk: number) => {
      if (risk < 4) return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' };
      if (risk < 7) return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' };
      return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
  };
  const riskStyles = getOverallRiskStyles(analysis.overall_risk);

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      
      {/* 1. Header with Risk Score */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Decoded Insight</h2>
          <p className="text-slate-500 text-sm">Personalized interpretation</p>
        </div>
        <div 
          className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl border-2 shadow-sm ${riskStyles.border} ${riskStyles.bg} ${riskStyles.text}`}
          role="img"
          aria-label={`Risk Level ${analysis.overall_risk}`}
        >
          <span className="text-2xl font-bold" aria-hidden="true">{analysis.overall_risk}</span>
          <span className="text-[9px] uppercase font-bold tracking-wider" aria-hidden="true">Risk</span>
        </div>
      </div>

      {/* 2. Personalized "Whisper" Translation (No Label) */}
      <div className="bg-indigo-600 rounded-2xl p-6 shadow-lg shadow-indigo-200 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10">
           <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
        </div>
        
        <p className="text-white text-lg md:text-xl font-medium leading-relaxed relative z-10 italic">
          "{analysis.nt_translation}"
        </p>

        <div className="mt-4 flex gap-3 relative z-10">
          <button 
             onClick={playSummary}
             disabled={isPlaying}
             className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-all backdrop-blur-sm"
             aria-label="Listen"
          >
             {isPlaying ? (
               <span className="animate-pulse">🔊 Playing...</span>
             ) : (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
             )}
          </button>
          <button 
             onClick={copyTranslation}
             className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-all backdrop-blur-sm"
             aria-label="Copy"
          >
             {copiedTrans ? (
               <svg className="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
             ) : (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
             )}
          </button>
        </div>
      </div>
      
      {/* 3. Visual Heat Map Grid (Replaces Text List) */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
           Emotional Heat Map
        </h3>
        {/* The requested Visual Pictorial Format */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {analysis.lenses?.length > 0 ? (
            analysis.lenses.sort((a,b) => b.prob - a.prob).map((lens, idx) => (
              <LensHeatMapCard key={idx} lens={lens} />
            ))
          ) : (
            <div className="col-span-4 p-4 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
               No emotional lenses detected.
            </div>
          )}
        </div>
      </div>

      {/* 4. Safe Replies (Simplified) */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
           Suggested Responses
        </h3>
        <div className="flex flex-col gap-2">
          {analysis.safe_replies?.map((reply, idx) => (
            <button 
              key={idx} 
              onClick={() => navigator.clipboard.writeText(reply)}
              className="text-left p-4 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all group flex justify-between items-center"
            >
              <span className="text-slate-700 font-medium text-sm">{reply}</span>
              <span className="opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Minimal Feedback */}
      <div className="pt-6 border-t border-slate-100 mt-6 flex justify-center">
        {!feedbackSubmitted ? (
          <div className="flex gap-4">
             <button onClick={() => setFeedbackSubmitted(true)} className="text-slate-400 hover:text-green-600 transition-colors" aria-label="Helpful">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
             </button>
             <button onClick={() => setFeedbackSubmitted(true)} className="text-slate-400 hover:text-red-600 transition-colors" aria-label="Not Helpful">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
             </button>
          </div>
        ) : (
          <span className="text-xs text-green-600 font-bold">Feedback received.</span>
        )}
      </div>
    </div>
  );
};