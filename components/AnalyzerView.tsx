import React, { useState, useRef, useEffect } from 'react';
import { analyzeSocialCues, analyzeDraftReply } from '../services/gemini';
import { SocialAnalysis, AnalysisHistoryItem, DraftAnalysis } from '../types';
import { AnalysisResult } from './AnalysisResult';
// @ts-ignore
import Plotly from 'plotly.js-dist';

const RELATIONSHIPS = [
  "Stranger",
  "Friend",
  "Best Friend",
  "Acquaintance",
  "Coworker",
  "Boss / Manager",
  "Parent / Family",
  "Sibling",
  "Partner / Spouse",
  "Teacher / Mentor",
  "Neighbor",
  "Service Provider (e.g. Doctor, Waiter)",
  "Online Friend/Stranger",
  "Other"
];

export const AnalyzerView: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0]);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  // Draft State
  const [draftText, setDraftText] = useState('');
  const [draftAnalysis, setDraftAnalysis] = useState<DraftAnalysis | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isDraftSectionOpen, setIsDraftSectionOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results when analysis completes
  useEffect(() => {
    if (history.length > 0 && !loading && resultsTopRef.current) {
       resultsTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [history, loading]);

  // Render Heatmap when history changes
  useEffect(() => {
    if (history.length === 0 || !chartRef.current) return;

    // Prepare data for Heatmap
    const chronologicalHistory = [...history].reverse(); // Oldest first
    const turns = chronologicalHistory.map((_, i) => `Turn ${i + 1}`);
    
    // Collect all unique lens names across history
    const allLensNames = Array.from(new Set(
      chronologicalHistory.flatMap(h => h.analysis?.lenses?.map(l => l.name) || [])
    ));
    
    // Only proceed if we have lenses
    if (allLensNames.length === 0) return;

    // Build the Z matrix (Probabilities)
    const zData = allLensNames.map(lensName => {
      return chronologicalHistory.map(item => {
        const found = item.analysis?.lenses?.find(l => l.name === lensName);
        return found ? found.prob : 0;
      });
    });

    const data = [{
      z: zData,
      x: turns,
      y: allLensNames,
      type: 'heatmap',
      colorscale: 'RdBu',
      reversescale: true,
      showscale: false,
      hoverongaps: false,
      hovertemplate: '<b>%{y}</b><br>Probability: %{z:.0%}<extra></extra>'
    }];

    const layout = {
      title: { text: 'Emotional Dynamics Heatmap', font: { size: 14, color: '#64748b' } },
      margin: { t: 40, r: 20, b: 40, l: 120 },
      height: 300,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      xaxis: { title: 'Conversation Flow', fixedrange: true },
      yaxis: { fixedrange: true },
      font: { family: 'Inter, sans-serif' }
    };

    const config = { responsive: true, displayModeBar: false };

    Plotly.react(chartRef.current, data, layout, config);

  }, [history]);

  const handleAnalyze = async (audioData?: { data: string; mimeType: string }) => {
    const inputContent = inputText || (audioData ? "Audio Input" : selectedImage ? "Image Input" : "");
    if (!inputContent) {
      setError("Please enter text, upload an image, or record audio.");
      return;
    }

    setLoading(true);
    setError(null);
    setDraftAnalysis(null); // Clear previous draft analysis
    setDraftText(''); 
    
    try {
      const result = await analyzeSocialCues(
        inputText, 
        relationship,
        history.slice(0, 5), 
        selectedImage || undefined, 
        audioData
      );
      
      const newItem: AnalysisHistoryItem = {
        id: Date.now().toString(),
        input: inputText || (audioData ? "[Audio Analysis]" : "[Image Analysis]"),
        relationship: relationship,
        analysis: result,
        timestamp: new Date()
      };

      setHistory(prev => [newItem, ...prev].slice(0, 5));
      
      if (inputText) setInputText('');

    } catch (err: any) {
      console.error(err);
      setError("Analysis failed. Please try again. " + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleDraftAnalyze = async () => {
    if (!draftText.trim()) return;
    if (history.length === 0) return;

    setIsDrafting(true);
    setDraftError(null);
    try {
      // Analyze draft against the most recent input
      const result = await analyzeDraftReply(
        history[0].input, 
        history[0].relationship, 
        draftText
      );
      setDraftAnalysis(result);
    } catch (e: any) {
      console.error(e);
      setDraftError("Couldn't analyze draft. " + (e.message || "Please try again."));
    } finally {
      setIsDrafting(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setSelectedImage({ data: base64String, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      // Apply Echo Cancellation constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          handleAnalyze({ data: base64String, mimeType: 'audio/webm' });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const clearAll = () => {
    setInputText('');
    setSelectedImage(null);
    setHistory([]);
    setDraftText('');
    setDraftAnalysis(null);
    setIsDraftSectionOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const currentAnalysis = history.length > 0 ? history[0].analysis : null;

  const getRiskColorClass = (risk: number) => {
    if (risk < 4) return 'border-l-green-500 bg-green-50/30';
    if (risk < 7) return 'border-l-yellow-500 bg-yellow-50/30';
    return 'border-l-red-500 bg-red-50/30';
  };

  const getDraftRiskColor = (risk: number) => {
    if (risk < 4) return 'text-green-700 bg-green-50 border-green-200';
    if (risk < 7) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-red-700 bg-red-50 border-red-200';
  }

  // Visual icons for history list
  const getRiskIcon = (risk: number) => {
    if (risk < 4) return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ); // Check
    if (risk < 7) return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ); // Info/Warn
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ); // Danger
  };

  return (
    <div className="flex flex-col h-full lg:flex-row">
      {/* Left Panel: Input */}
      <div className="w-full lg:w-1/3 p-6 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col gap-6" role="region" aria-label="Input Area">
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            Social Decoder
          </h2>
          <p className="text-slate-500 text-sm">Paste a chat, upload a screenshot, or record audio.</p>
        </div>

        <div className="space-y-4 flex-1">
          {/* Relationship Selector with Icon Label */}
          <div>
            <label htmlFor="relationship-select" className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Relationship Context
            </label>
            <div className="relative">
              <select
                id="relationship-select"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full p-3 pl-4 rounded-xl border border-slate-300 appearance-none bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 font-medium"
              >
                {RELATIONSHIPS.map(rel => (
                  <option key={rel} value={rel}>{rel}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Text Input */}
          <div>
            <label htmlFor="context-input" className="sr-only">Type or paste message here</label>
            <textarea
              id="context-input"
              className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none bg-slate-50 h-32 text-slate-800"
              placeholder="Type or paste the message you want to understand..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              aria-label="Input text for analysis"
            />
          </div>

          {/* Media Actions - Icon Heavy */}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs ${selectedImage ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}
              aria-label={selectedImage ? "Change Image" : "Add Image"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {selectedImage ? 'Image Ready' : 'Add Image'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageUpload}
              aria-hidden="true"
              tabIndex={-1}
            />
            
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`flex-1 flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs select-none ${isRecording ? 'bg-red-50 border-red-300 text-red-600 animate-pulse' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}
              aria-label={isRecording ? "Stop Recording" : "Hold to Record Audio"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              {isRecording ? 'Listening...' : 'Hold Record'}
            </button>
          </div>
          
          {selectedImage && (
             <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200">
               <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} alt="Preview of uploaded context" className="w-full h-full object-cover opacity-80" />
               <button 
                 onClick={() => setSelectedImage(null)}
                 className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 focus:outline-none focus:ring-2 focus:ring-white"
                 aria-label="Remove image"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
             </div>
          )}

          <button
            onClick={() => handleAnalyze()}
            disabled={loading || isRecording}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transform transition-all active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-indigo-200 flex items-center justify-center gap-3 ${
              loading
                ? 'bg-slate-300 text-slate-500 cursor-wait'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl'
            }`}
            aria-label={loading ? "Analyzing content..." : "Analyze Social Cues"}
          >
             {loading ? (
                <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
             ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             )}
            {loading ? 'Decoding...' : 'Interpret Meaning'}
          </button>
          
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200 flex items-start gap-2" role="alert">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          
          {history.length > 0 && (
            <button onClick={clearAll} className="w-full py-2 text-slate-400 text-sm font-medium hover:text-slate-600 focus:outline-none focus:text-slate-600 flex items-center justify-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Clear History
            </button>
          )}
        </div>
      </div>

      {/* Right Panel: Output */}
      <div className="w-full lg:w-2/3 p-6 bg-slate-50 h-full overflow-y-auto" role="region" aria-label="Analysis Results">
        <div ref={resultsTopRef} /> {/* Scroll anchor */}
        
        {currentAnalysis ? (
          <div className="space-y-8 pb-10">
            {/* Main Result */}
            <AnalysisResult analysis={currentAnalysis} />
            
            {/* Collapsible Pre-Send Check Section */}
            <div className="animate-fade-in bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <button 
                 onClick={() => setIsDraftSectionOpen(!isDraftSectionOpen)}
                 className="w-full p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                 aria-expanded={isDraftSectionOpen}
               >
                 <div className="text-left">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Check My Reply (Optional)
                    </h3>
                    <p className="text-sm text-slate-500">Draft your response to check tone before sending.</p>
                 </div>
                 <svg 
                   xmlns="http://www.w3.org/2000/svg" 
                   className={`h-6 w-6 text-slate-400 transition-transform ${isDraftSectionOpen ? 'rotate-180' : ''}`} 
                   fill="none" viewBox="0 0 24 24" stroke="currentColor"
                 >
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                 </svg>
               </button>
               
               {isDraftSectionOpen && (
                 <div className="p-5 space-y-4 animate-fade-in">
                   <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder="Type your draft reply here..."
                      className="w-full p-4 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-32 text-slate-800"
                   />
                   <div className="flex justify-between items-center">
                     {draftError && <span className="text-xs text-red-500 font-medium">{draftError}</span>}
                     <button
                       onClick={handleDraftAnalyze}
                       disabled={!draftText || isDrafting}
                       className={`ml-auto px-6 py-2 rounded-lg font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                         !draftText || isDrafting ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                       }`}
                     >
                       {isDrafting ? 'Checking...' : 'Check Safety'}
                     </button>
                   </div>

                   {draftAnalysis && (
                     <div className="mt-4 animate-fade-in space-y-4">
                       {/* Score & Critique */}
                       <div className={`p-4 rounded-lg border ${getDraftRiskColor(draftAnalysis.risk_score)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold uppercase text-xs tracking-wider">Risk Score</span>
                            <span className="font-bold text-lg">{draftAnalysis.risk_score}/10</span>
                          </div>
                          <p className="text-sm font-medium">{draftAnalysis.critique}</p>
                       </div>

                       {/* Suggestions */}
                       <div>
                         <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Better Variants</h4>
                         <div className="grid gap-2">
                           {draftAnalysis.better_variants && draftAnalysis.better_variants.length > 0 ? (
                             draftAnalysis.better_variants.map((variant, i) => (
                               <button
                                 key={i}
                                 onClick={() => setDraftText(variant)}
                                 className="text-left w-full p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-sm text-slate-700 group relative"
                               >
                                 <div className="pr-16">
                                   <span>{variant}</span>
                                 </div>
                                 <span className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 text-indigo-600 text-xs font-bold bg-indigo-100 px-2 py-1 rounded">Use This</span>
                               </button>
                             ))
                           ) : (
                             <p className="text-sm text-slate-400 italic">No variants generated.</p>
                           )}
                         </div>
                       </div>
                     </div>
                   )}
                 </div>
               )}
            </div>

            {/* Visualization Section */}
            {history.length > 1 && (
              <div className="animate-fade-in border-t border-slate-200 pt-8">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-6">Emotional Trends</h3>
                
                {/* Plotly Chart Container */}
                <div className="w-full h-64 bg-white rounded-xl border border-slate-200 shadow-sm mb-8 overflow-hidden" aria-hidden="true">
                   <div ref={chartRef} className="w-full h-full" />
                </div>
                {/* Screen Reader Summary for Chart */}
                <p className="sr-only">
                  A heatmap showing the change in emotional probabilities over the last {history.length} turns. 
                  Generally showing a shift in risk levels. Refer to the list below for specific details of each turn.
                </p>

                {/* History Timeline */}
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">Past Exchanges</h3>
                <ul className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                   {history.slice(1).map((item) => (
                     <li key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                       
                       {/* Visual Status Indicator Icon */}
                       <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
                         item.analysis.overall_risk < 4 ? 'bg-green-500' : item.analysis.overall_risk < 7 ? 'bg-yellow-500' : 'bg-red-500'
                       } text-white`} aria-hidden="true">
                         {getRiskIcon(item.analysis.overall_risk)}
                       </div>

                       {/* Card */}
                       <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border-l-4 shadow-sm hover:shadow-md transition-all ${getRiskColorClass(item.analysis.overall_risk)}`}>
                         <span className="sr-only">
                           Risk Level: {item.analysis.overall_risk < 4 ? 'Low' : item.analysis.overall_risk < 7 ? 'Medium' : 'High'}.
                         </span>
                         <div className="flex justify-between items-start mb-2">
                           <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                             {item.relationship}
                           </span>
                           <time className="text-[10px] text-slate-400">{item.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
                         </div>
                         
                         {/* Original Input */}
                         <div className="mb-3">
                           <p className="text-xs font-bold text-slate-500 mb-1">You said:</p>
                           <p className="text-slate-800 text-sm italic border-l-2 border-slate-200 pl-2">"{item.input}"</p>
                         </div>

                         {/* Translation */}
                         <div>
                            <p className="text-xs font-bold text-indigo-500 mb-1">Translation:</p>
                            <p className="text-slate-700 text-sm font-medium">{item.analysis.nt_translation}</p>
                         </div>
                       </div>
                     </li>
                   ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 p-8 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-xl font-bold text-slate-600">Ready to Interpret</p>
            <p className="text-sm mt-2 max-w-xs">Select your relationship context on the left and provide input to decode hidden social meanings.</p>
          </div>
        )}
      </div>
    </div>
  );
};