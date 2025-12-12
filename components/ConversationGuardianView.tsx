import React, { useState, useRef, useEffect } from 'react';
import { connectGuardian, createBlob } from '../services/gemini';
import { GuardianSignal } from '../types';

const RELATIONSHIPS = [
  "Stranger", "Friend", "Best Friend", "Acquaintance", "Coworker", 
  "Boss / Manager", "Parent / Family", "Sibling", "Partner / Spouse", 
  "Teacher / Mentor", "Service Provider"
];

export const ConversationGuardianView: React.FC = () => {
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0]); // Default to Stranger
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("Ready to Monitor");
  const [guardianSignal, setGuardianSignal] = useState<GuardianSignal | null>(null);
  const [transcript, setTranscript] = useState<{role: string, text: string, time: string}[]>([]);

  // Refs for audio processing
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const isMonitoringRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
       transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'caution': return 'border-red-500 bg-red-50 text-red-900';
      case 'attention': return 'border-yellow-500 bg-yellow-50 text-yellow-900';
      case 'mild': return 'border-indigo-300 bg-indigo-50 text-indigo-900';
      default: return 'border-green-400 bg-green-50 text-green-900';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'caution': return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
      case 'attention': return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      );
      case 'mild': return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      );
      default: return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" viewBox="0 0 20 20" fill="currentColor">
           <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    }
  };

  const startMonitoring = async () => {
    setStatus("Connecting to Guardian...");
    isMonitoringRef.current = true;
    setTranscript([]); // Clear previous transcript only on explicit start

    try {
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await inputAudioContext.resume();
      inputAudioContextRef.current = inputAudioContext;

      // STRICT CONSTRAINTS FOR ECHO CANCELLATION
      // This is critical for screen reader users to prevent loopback
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      const sessionPromise = connectGuardian(
        relationship,
        () => {
          if (!isMonitoringRef.current) return;
          setIsConnected(true);
          setStatus("Monitoring...");
          
          // Audio Pipeline
          const source = inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
             if (!isMonitoringRef.current) return; // Prevent processing if stopped

             const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
             const pcmBlob = createBlob(inputData);
             sessionPromise.then((session: any) => {
               if (!isMonitoringRef.current) return;
               sessionRef.current = session;
               session.sendRealtimeInput({ media: pcmBlob }).catch((e: any) => {
                  console.warn("Guardian: Failed to send input (session likely closed)", e);
               });
             });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        (signal) => {
          if (isMonitoringRef.current) {
            setGuardianSignal(signal);
            // INJECT SIGNAL INTO TRANSCRIPT
            // Since the model is silent, we treat the signal update as the model's "turn" in the logs.
            const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let text = `[${signal.signal.toUpperCase()}] ${signal.reason}`;
            if (signal.suggested_action) text += ` → Suggestion: "${signal.suggested_action}"`;
            
            setTranscript(prev => [...prev, {
               role: 'model',
               text: text,
               time: time
            }]);
          }
        },
        (role, text) => {
           setTranscript(prev => [...prev, {
             role, 
             text, 
             time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
           }]);
        },
        () => {
          // IMPORTANT: If user didn't click stop, this is an unexpected disconnect.
          // Don't wipe state, just update status.
          setIsConnected(false);
          if (isMonitoringRef.current) {
             setStatus("Connection Dropped. Transcript Saved.");
             // We do NOT set isMonitoringRef to false here, allowing user to see "Stop" button 
             // to reset explicitly or "Start" if we want to auto-recover logic later.
             // For now, let's treat it as paused.
          } else {
             setStatus("Disconnected");
          }
        },
        (err) => {
          if (!isMonitoringRef.current) return;
          console.error(err);
          let msg = err.message || "Connection failed";
          if (msg.includes("403")) msg = "Access Denied. Check API Key.";
          setStatus("Error: " + msg);
          setIsConnected(false);
          // Don't stop monitoring flag, let user decide to reset.
        }
      );
    } catch (e: any) {
      console.error(e);
      setStatus("Error: " + e.message);
      isMonitoringRef.current = false;
    }
  };

  const stopMonitoring = () => {
    isMonitoringRef.current = false; // Explicit user stop
    
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) { console.warn("Error closing session", e); }
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      try {
        inputAudioContextRef.current.close();
      } catch (e) { console.warn("Error closing audio context", e); }
    }
    
    setIsConnected(false);
    setStatus("Stopped");
    setGuardianSignal(null);
  };

  useEffect(() => {
    return () => {
      isMonitoringRef.current = false;
      if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-hidden">
      <div className="max-w-4xl mx-auto w-full h-full flex flex-col space-y-6">
        
        {/* Header Section */}
        <div className="text-center shrink-0">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-full text-indigo-600 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Conversation Guardian</h2>
          <p className="text-slate-500 text-sm">
            Silent monitoring & transcript capture. Session persists until you stop.
          </p>
        </div>

        {/* Configuration */}
        {!isConnected && !transcript.length && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in shrink-0">
             <label className="block text-sm font-bold text-slate-700 mb-2">Relationship Context</label>
             <select 
               value={relationship} 
               onChange={(e) => setRelationship(e.target.value)}
               className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-indigo-500 appearance-none text-slate-700 font-medium"
             >
               {RELATIONSHIPS.map(r => (
                  <option key={r} value={r}>{r}</option>
               ))}
             </select>
             <p className="text-xs text-slate-400 mt-2">Adjusts sensitivity based on power dynamics.</p>
          </div>
        )}

        {/* Live Signal Card (Always visible if signal exists or connected) */}
        {(isConnected || guardianSignal) && (
           <div className="animate-fade-in relative shrink-0">
             {guardianSignal ? (
               <div className={`p-6 rounded-2xl border-l-8 shadow-md bg-white transition-all duration-500 ${getSignalColor(guardianSignal.signal)}`}>
                 <div className="flex items-start justify-between mb-4">
                   <div className="flex items-center gap-3">
                     {getSignalIcon(guardianSignal.signal)}
                     <div>
                       <h3 className="text-lg font-bold capitalize">{guardianSignal.signal === 'none' ? 'All Clear' : guardianSignal.signal + ' Signal'}</h3>
                       <p className="text-sm opacity-80">{guardianSignal.reason}</p>
                     </div>
                   </div>
                   <div className="text-right">
                      <span className="block text-xs font-bold uppercase tracking-wider opacity-60">Risk Trend</span>
                      <span className={`font-bold ${
                        guardianSignal.risk_trend === 'rising' ? 'text-red-600' : 
                        guardianSignal.risk_trend === 'easing' ? 'text-green-600' : 'text-slate-600'
                      }`}>
                        {guardianSignal.risk_trend.toUpperCase()}
                      </span>
                   </div>
                 </div>
                 
                 {guardianSignal.gentle_hint && (
                   <div className="bg-white/60 p-4 rounded-xl backdrop-blur-sm mb-3">
                      <p className="font-medium text-lg text-slate-800">"{guardianSignal.gentle_hint}"</p>
                   </div>
                 )}

                 {/* Action Plan for High Risk */}
                 {guardianSignal.suggested_action && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3 animate-pulse">
                       <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded uppercase mt-1 shrink-0">Try This</span>
                       <p className="text-blue-900 font-medium text-sm leading-relaxed">{guardianSignal.suggested_action}</p>
                    </div>
                 )}
               </div>
             ) : (
               <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 text-center text-slate-400 bg-slate-50/50">
                 <p className="animate-pulse">Listening silently...</p>
                 <p className="text-sm mt-1">Guidance will appear here when needed.</p>
               </div>
             )}
           </div>
        )}

        {/* Live Transcript Log */}
        {transcript.length > 0 && (
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Live Transcript</h3>
              <span className="text-xs text-slate-400">{transcript.length} turns</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
               {transcript.map((item, i) => (
                 <div key={i} className={`flex ${item.role === 'model' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm border ${
                        item.role === 'model' 
                        ? 'bg-indigo-50 border-indigo-100 rounded-tl-none' 
                        : 'bg-white border-slate-200 rounded-tr-none'
                    }`}>
                       <div className="flex items-center justify-between gap-4 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                              item.role === 'model' ? 'text-indigo-600' : 'text-slate-500'
                          }`}>
                              {item.role === 'model' ? '🛡️ Guardian Signal' : 'You'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                              {item.time}
                          </span>
                       </div>
                       <p className={`text-sm leading-relaxed ${item.role === 'model' ? 'text-indigo-900 font-medium' : 'text-slate-700'}`}>
                          {item.text}
                       </p>
                    </div>
                 </div>
               ))}
               <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-center shrink-0 pb-4">
           {(!isConnected && !isMonitoringRef.current) ? (
             <button 
               onClick={startMonitoring}
               className="px-8 py-4 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 hover:shadow-xl hover:scale-105 transition-all focus:outline-none focus:ring-4 focus:ring-indigo-300 flex items-center gap-2"
             >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
               </svg>
               {transcript.length > 0 ? "Resume Monitoring" : "Start Guardian Mode"}
             </button>
           ) : (
             <button 
               onClick={stopMonitoring}
               className="px-8 py-3 bg-white text-red-600 border border-red-200 rounded-full font-bold shadow hover:bg-red-50 transition-all focus:outline-none focus:ring-4 focus:ring-red-100"
             >
               Stop Monitoring
             </button>
           )}
        </div>
        
        {/* Status Indicator */}
        <div className="text-center shrink-0">
           <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${isConnected ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
             <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></span>
             {status}
           </span>
        </div>

      </div>
    </div>
  );
};