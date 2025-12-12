import React, { useEffect, useRef, useState } from 'react';
import { liveConnect, createBlob, generatePracticeFeedback } from '../services/gemini';
import { LiveServerMessage } from '@google/genai';
import { ChatMessage, MessageType, PracticeFeedback } from '../types';
// @ts-ignore
import Plotly from 'plotly.js-dist';

const SCENARIOS = [
  {
    id: 'casual',
    title: 'Casual Coffee Chat',
    description: 'Low stakes. You are chatting with a friendly acquaintance you bumped into at a cafe.',
    icon: '☕',
    coachingGoal: 'Practice maintaining flow with open-ended follow-up questions.'
  },
  {
    id: 'work_conflict',
    title: 'Workplace Disagreement',
    description: 'Medium stakes. A coworker is politely but firmly disagreeing with your project idea in a meeting.',
    icon: '💼',
    coachingGoal: 'Validate their perspective before restating your own points (active listening).'
  },
  {
    id: 'interview',
    title: 'Job Interview',
    description: 'High stakes. A hiring manager is asking you behavioral questions about your past experience.',
    icon: '🤝',
    coachingGoal: 'Structure answers using the STAR method (Situation, Task, Action, Result).'
  },
  {
    id: 'social_group',
    title: 'Social Group Entry',
    description: 'Medium stakes. You are at a party and trying to join a group of three people already talking.',
    icon: '🎉',
    coachingGoal: 'Identify a pause in conversation to introduce yourself smoothly without interrupting.'
  },
  {
    id: 'dating',
    title: 'First Date',
    description: 'Personal. You are at dinner with someone new. You want to gauge compatibility.',
    icon: '❤️',
    coachingGoal: 'Balance sharing about yourself with showing genuine interest in them (reciprocity).'
  },
  {
    id: 'boundary',
    title: 'Setting Boundaries',
    description: 'Medium stakes. A friend asks for a favor you cannot do (e.g., borrowing money or helping move).',
    icon: '🛑',
    coachingGoal: 'Say "No" clearly and politely without over-explaining or apologizing excessively.'
  },
  {
    id: 'phone_call',
    title: 'Scheduling Appointment',
    description: 'Functional. You are calling a doctor\'s office to schedule a check-up.',
    icon: '📞',
    coachingGoal: 'Have your calendar ready and clearly state your preferred times and availability.'
  },
  {
    id: 'return_item',
    title: 'Store Return',
    description: 'Conflict resolution. You need to return a defective item but lost the receipt. The clerk is following strict policy.',
    icon: '🧾',
    coachingGoal: 'Practice the "Broken Record" technique: politely repeating your core request without getting angry.'
  },
  {
    id: 'family_dinner',
    title: 'Family Holiday Dinner',
    description: 'Complex dynamics. A relative asks intrusive questions about your life choices or career during a meal.',
    icon: '🦃',
    coachingGoal: 'Set a boundary by deflecting with humor or a neutral "I\'d rather not discuss that today."'
  },
  {
    id: 'networking',
    title: 'Professional Networking',
    description: 'Professional. You are at an industry event and want to make a new contact.',
    icon: '📛',
    coachingGoal: 'Introduce yourself with a clear "elevator pitch" and ask one relevant question about their work.'
  }
];

// Helper to save history to LocalStorage
const savePracticeSession = (scenarioId: string, data: PracticeFeedback) => {
  try {
    const raw = localStorage.getItem('emotional_ai_practice_history');
    const history = raw ? JSON.parse(raw) : {};
    if (!history[scenarioId]) history[scenarioId] = [];
    
    history[scenarioId].push({
      date: new Date().toISOString(),
      scores: {
        goal: data.goal_alignment_score,
        confidence: data.confidence_score
      }
    });
    
    // Keep last 10 attempts
    if (history[scenarioId].length > 10) {
      history[scenarioId] = history[scenarioId].slice(-10);
    }
    
    localStorage.setItem('emotional_ai_practice_history', JSON.stringify(history));
  } catch (e) {
    console.warn("Failed to save history", e);
  }
};

const getPracticeHistory = (scenarioId: string) => {
  try {
    const raw = localStorage.getItem('emotional_ai_practice_history');
    return raw ? JSON.parse(raw)[scenarioId] || [] : [];
  } catch {
    return [];
  }
};

export const LivePracticeView: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("Disconnected");
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  
  // Mute State for User Autonomy
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  
  // Feedback State
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Refs for audio processing and transcripts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null); // To store the resolved session
  const endButtonRef = useRef<HTMLButtonElement>(null);
  const isExplicitlyStoppedRef = useRef(false);
  
  // Ref for conversation to avoid closure staleness
  const conversationRef = useRef<ChatMessage[]>([]);

  // Transcripts accumulators - Not used for accumulation anymore, we stream directly to state
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const trendChartRef = useRef<HTMLDivElement>(null);

  // Sync ref with state
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Auto-scroll effect
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, feedback, isGeneratingFeedback, feedbackError]);

  // Render Charts when feedback is available
  useEffect(() => {
    if (!feedback) return;

    // 1. Radar Chart (Current Session)
    if (chartRef.current) {
        const data = [{
          type: 'scatterpolar',
          r: [
            feedback.goal_alignment_score || 0,
            feedback.clarity_score || 0,
            feedback.confidence_score || 0,
            feedback.empathy_score || 0,
            feedback.goal_alignment_score || 0 // Close loop
          ],
          theta: ['Goal Alignment', 'Clarity', 'Confidence', 'Empathy', 'Goal Alignment'],
          fill: 'toself',
          fillcolor: 'rgba(79, 70, 229, 0.2)',
          line: { color: '#4f46e5' }
        }];

        const layout = {
          polar: {
            radialaxis: { visible: true, range: [0, 10], tickfont: { size: 10, color: '#94a3b8' } },
            angularaxis: { tickfont: { size: 11, color: '#334155', family: 'Inter, sans-serif', weight: 700 } }
          },
          margin: { t: 20, b: 20, l: 30, r: 30 },
          height: 250,
          paper_bgcolor: 'transparent',
          showlegend: false
        };
        // @ts-ignore
        Plotly.newPlot(chartRef.current, data, layout, { displayModeBar: false, responsive: true });
    }

    // 2. Trend Chart (History)
    if (trendChartRef.current) {
       const history = getPracticeHistory(selectedScenario.id);
       
       if (history.length > 1) {
         const xValues = history.map((_: any, i: number) => `Attempt ${i + 1}`);
         const goalValues = history.map((h: any) => h.scores.goal);
         const confValues = history.map((h: any) => h.scores.confidence);

         const trace1 = {
           x: xValues,
           y: goalValues,
           mode: 'lines+markers',
           name: 'Goal Alignment',
           line: { color: '#4f46e5', width: 3 }
         };
         
         const trace2 = {
           x: xValues,
           y: confValues,
           mode: 'lines+markers',
           name: 'Confidence',
           line: { color: '#10b981', width: 3 }
         };

         const layout = {
           title: { text: 'Progress Over Time', font: { size: 12, color: '#64748b' } },
           margin: { t: 30, b: 30, l: 30, r: 10 },
           height: 250,
           paper_bgcolor: 'transparent',
           plot_bgcolor: 'transparent',
           xaxis: { showgrid: false },
           yaxis: { range: [0, 10.5] },
           legend: { orientation: 'h', y: -0.2 }
         };
         
         // @ts-ignore
         Plotly.newPlot(trendChartRef.current, [trace1, trace2], layout, { displayModeBar: false, responsive: true });
       }
    }

  }, [feedback, selectedScenario.id]);


  // Focus management: When connected, focus the "End Session" button for accessibility
  useEffect(() => {
    if (isConnected && endButtonRef.current) {
      endButtonRef.current.focus();
    }
  }, [isConnected]);

  // Toggle Mute Handler
  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    isMutedRef.current = newState;
  };

  // Decode audio data function
  async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    
    // Safety check for empty buffer
    if (frameCount <= 0) {
      return ctx.createBuffer(numChannels, 1, sampleRate); // Return safe empty buffer
    }

    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
  
  // Decode base64 helper
  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Update conversation state with streaming text
  const updateStreamingTranscript = (role: MessageType, textFragment: string) => {
     setConversation(prev => {
        const lastMsg = prev[prev.length - 1];
        // If last message matches role, append
        if (lastMsg && lastMsg.role === role) {
           return [
             ...prev.slice(0, -1),
             { ...lastMsg, text: lastMsg.text + textFragment }
           ];
        } else {
           // Create new message
           return [
             ...prev,
             {
               id: Date.now() + '-' + role,
               role: role,
               text: textFragment,
               timestamp: new Date()
             }
           ];
        }
     });
  };

  const connect = async () => {
    setStatus("Initializing Audio...");
    setFeedback(null); // Clear previous feedback
    setFeedbackError(null);
    setConversation([]); // Clear previous chat
    conversationRef.current = []; // Clear ref
    setIsAiSpeaking(false);
    setIsMuted(false);
    isMutedRef.current = false;
    isExplicitlyStoppedRef.current = false;
    
    try {
      // 1. Initialize Audio Contexts
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      
      // CRITICAL: Resume audio contexts immediately after user interaction
      await Promise.all([inputAudioContext.resume(), outputAudioContext.resume()]);

      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);
      
      inputAudioContextRef.current = inputAudioContext;
      outputAudioContextRef.current = outputAudioContext;

      // 2. Get Microphone Stream
      setStatus("Requesting Microphone...");
      // ENABLE ECHO CANCELLATION AND NOISE SUPPRESSION
      const stream = await navigator.mediaDevices.getUserMedia({ 
         audio: {
           echoCancellation: true,
           noiseSuppression: true,
           autoGainControl: true
         } 
      });
      setStatus("Connecting to Gemini Live...");

      // 3. Connect to Live API
      const sessionPromise = liveConnect(
        { 
          scenario: selectedScenario.description, 
          goal: selectedScenario.coachingGoal 
        },
        () => {
          setStatus("Connected");
          setIsConnected(true);
          
          // Setup input streaming
          const source = inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            // Check mute state first
            if (isMutedRef.current) return;

            // Half-duplex Input Gating:
            if (outputAudioContextRef.current && nextStartTimeRef.current > outputAudioContextRef.current.currentTime) {
               return; 
            }

            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromise.then((session: any) => {
              sessionRef.current = session;
              session.sendRealtimeInput({ media: pcmBlob });
            }).catch(e => console.error("Session send error:", e));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        async (message: LiveServerMessage) => {
           // 1. Handle Transcriptions (STREAMING UPDATES)
           if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              if (text) updateStreamingTranscript(MessageType.USER, text);
           }
           if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              if (text) updateStreamingTranscript(MessageType.MODEL, text);
           }
           
           // We do NOT wait for turnComplete to show text, to ensure it feels live and nothing is lost.

           // 3. Handle Audio Output
           const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
           if (base64EncodedAudioString && outputAudioContextRef.current) {
             const ctx = outputAudioContextRef.current;
             nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
             
             const audioBuffer = await decodeAudioData(
               decode(base64EncodedAudioString),
               ctx,
               24000,
               1
             );
             
             const source = ctx.createBufferSource();
             source.buffer = audioBuffer;
             source.connect(outputNode);
             
             // Update speaking state
             setIsAiSpeaking(true);
             
             source.addEventListener('ended', () => {
               sourcesRef.current.delete(source);
               // Check if this was the last source in the queue
               if (sourcesRef.current.size === 0 && ctx.currentTime >= nextStartTimeRef.current) {
                  setIsAiSpeaking(false);
               }
             });
             
             source.start(nextStartTimeRef.current);
             nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
             sourcesRef.current.add(source);
           }
           
           const interrupted = message.serverContent?.interrupted;
           if (interrupted) {
             for (const source of sourcesRef.current.values()) {
               source.stop();
               sourcesRef.current.delete(source);
             }
             nextStartTimeRef.current = 0;
             setIsAiSpeaking(false);
           }
        },
        () => {
          // ON CLOSE
          setIsAiSpeaking(false);
          setIsConnected(false);
          
          if (!isExplicitlyStoppedRef.current) {
             setStatus("Connection Ended (Check Network). You can View Analysis.");
          } else {
             setStatus("Disconnected");
          }
        },
        (err: any) => {
          console.error(err);
          let msg = err.message || "Connection Failed";
          if (msg.includes("Network")) msg = "Network Error: Check internet connection.";
          if (msg.includes("403")) msg = "Access Denied: Check API Key.";
          setStatus("Error: " + msg);
          setIsConnected(false);
        }
      );

      // Handle initial promise rejection
      sessionPromise.catch(e => {
        console.error("Initial Connection Error:", e);
        setStatus("Error: " + (e.message || "Failed to establish connection."));
        setIsConnected(false);
      });

    } catch (e: any) {
      console.error(e);
      setStatus("Error: " + (e.message || "Unknown error occurred"));
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    isExplicitlyStoppedRef.current = true; // Mark as user-initiated

    // 1. Close connections
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) { console.error("Error closing session", e); }
      sessionRef.current = null;
    }
    
    if (inputAudioContextRef.current) {
      try { await inputAudioContextRef.current.close(); } catch {}
    }
    if (outputAudioContextRef.current) {
      try { await outputAudioContextRef.current.close(); } catch {}
    }
    
    // 2. Generate Feedback if there was a conversation
    // Use REF to get the latest transcript regardless of react render cycle
    const currentTranscript = conversationRef.current;
    
    if (currentTranscript.length > 2) {
      setIsGeneratingFeedback(true); // Start loading state immediately
      setIsConnected(false);
      setIsAiSpeaking(false);
      setStatus("Analyzing Session...");

      try {
        const transcriptText = currentTranscript.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
        const feedbackData = await generatePracticeFeedback(transcriptText, selectedScenario.coachingGoal, selectedScenario.description);
        setFeedback(feedbackData);
        savePracticeSession(selectedScenario.id, feedbackData);
        setStatus("Session Complete");
      } catch (e) {
        console.error("Feedback generation failed", e);
        setFeedbackError("Failed to analyze session. The conversation was saved above, but AI feedback is unavailable.");
        setStatus("Session Complete (Error)");
      } finally {
        setIsGeneratingFeedback(false);
      }
    } else {
      setIsConnected(false);
      setIsAiSpeaking(false);
      setStatus("Disconnected");
    }
  };

  const resetSession = () => {
    setConversation([]);
    conversationRef.current = [];
    setFeedback(null);
    setFeedbackError(null);
    setStatus("Disconnected");
  };

  useEffect(() => {
    return () => {
      // Cleanup
      if (inputAudioContextRef.current) inputAudioContextRef.current.close().catch(()=>{});
      if (outputAudioContextRef.current) outputAudioContextRef.current.close().catch(()=>{});
    };
  }, []);

  // Poll for speaking state to ensure UI updates if audio ends between events
  useEffect(() => {
     if (!isConnected) return;
     const interval = setInterval(() => {
        if (outputAudioContextRef.current && isAiSpeaking) {
           if (outputAudioContextRef.current.currentTime >= nextStartTimeRef.current && sourcesRef.current.size === 0) {
              setIsAiSpeaking(false);
           }
        }
     }, 200);
     return () => clearInterval(interval);
  }, [isConnected, isAiSpeaking]);

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      
      {/* Active Session Info Bar */}
      {isConnected && (
        <div className="absolute top-0 left-0 right-0 bg-white border-b border-indigo-100 p-3 z-10 flex flex-col md:flex-row justify-between items-center shadow-sm gap-2 animate-slide-down" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">{selectedScenario.icon}</span>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">{selectedScenario.title}</p>
              <p className="text-xs text-slate-500"><span className="font-semibold text-indigo-600">Goal:</span> {selectedScenario.coachingGoal}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end md:self-auto">
             {isAiSpeaking ? (
                <div className="flex items-center gap-2 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-200 shadow-inner">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-4 bg-indigo-500 rounded-full animate-[wave_1s_ease-in-out_infinite]"></span>
                    <span className="w-1.5 h-4 bg-indigo-500 rounded-full animate-[wave_1s_ease-in-out_infinite_0.1s]"></span>
                    <span className="w-1.5 h-4 bg-indigo-500 rounded-full animate-[wave_1s_ease-in-out_infinite_0.2s]"></span>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 ml-1">AI Speaking</span>
                </div>
             ) : (
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-inner transition-colors ${isMuted ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-green-50 border-green-200'}`}>
                  {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12.732a1 1 0 001.707.707l3.553-3.553a1 1 0 00.293-.707V8a1 1 0 00-1-1zM6 10a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H6z" clipRule="evenodd" /></svg>
                  ) : (
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                  )}
                  <span className={`text-xs font-bold uppercase tracking-wider ml-1 ${isMuted ? '' : 'text-green-700'}`}>
                    {isMuted ? 'Mic Muted' : 'Listening'}
                  </span>
                </div>
             )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!isConnected && conversation.length === 0 && !isGeneratingFeedback && !feedbackError ? (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center animate-fade-in" role="region" aria-label="Scenario Selection">
           <div className="max-w-2xl w-full text-center mb-8">
             <h2 className="text-2xl font-bold text-slate-800 mb-2">Social Practice</h2>
             <p className="text-slate-500">Select a scenario. The AI will act as your partner.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl mb-12">
             {SCENARIOS.map((scenario) => (
               <button
                 key={scenario.id}
                 onClick={() => setSelectedScenario(scenario)}
                 aria-pressed={selectedScenario.id === scenario.id}
                 className={`p-6 rounded-2xl border transition-all hover:scale-[1.01] focus:outline-none focus:ring-4 focus:ring-indigo-100 flex flex-col h-full text-left relative overflow-hidden ${
                   selectedScenario.id === scenario.id 
                     ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-100 ring-2 ring-indigo-500 z-10' 
                     : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md'
                 }`}
               >
                 <div className="flex justify-between items-start mb-3">
                    <div className="text-3xl" aria-hidden="true">{scenario.icon}</div>
                    {selectedScenario.id === scenario.id && (
                        <div className="bg-indigo-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-full absolute top-4 right-4">Selected</div>
                    )}
                 </div>
                 <h3 className={`font-bold mb-1 text-lg ${selectedScenario.id === scenario.id ? 'text-indigo-900' : 'text-slate-800'}`}>
                   {scenario.title}
                 </h3>
                 <p className="text-sm text-slate-600 mb-4 flex-grow">
                   {scenario.description}
                 </p>
                 <div className="mt-auto pt-3 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Goal</p>
                    <p className={`text-xs font-medium ${selectedScenario.id === scenario.id ? 'text-indigo-700' : 'text-slate-500'}`}>{scenario.coachingGoal}</p>
                 </div>
               </button>
             ))}
           </div>
           
           {/* Connection Status Message */}
           {status !== "Disconnected" && (
             <div className={`mt-4 px-4 py-2 rounded-lg text-sm font-bold ${status.includes("Error") ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`} role="status" aria-live="assertive">
               {status}
             </div>
           )}
        </div>
      ) : (
        /* Chat History Area OR Feedback Area */
        <div 
           className={`flex-1 overflow-y-auto p-4 space-y-4 pb-48 ${isConnected ? 'pt-24' : 'pt-4'}`} 
           ref={scrollRef} 
           role="log" 
           aria-live="polite" 
           aria-label="Conversation Log"
        >
          
          {/* Messages */}
          {conversation.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === MessageType.USER ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div 
                className={`max-w-[85%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                  msg.role === MessageType.USER 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <span className="sr-only">{msg.role === MessageType.USER ? "You said:" : "AI said:"}</span>
                {msg.text}
              </div>
            </div>
          ))}

          {/* Feedback Card OR Error Card */}
          {(feedback || isGeneratingFeedback || feedbackError) && (
             <div className="w-full max-w-4xl mx-auto mt-8 mb-20 animate-slide-up">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                   <div className={`${feedbackError ? 'bg-red-50' : 'bg-indigo-50'} p-6 border-b ${feedbackError ? 'border-red-100' : 'border-indigo-100'}`}>
                      <h3 className={`text-xl font-bold ${feedbackError ? 'text-red-800' : 'text-indigo-900'}`}>{feedbackError ? 'Feedback Unavailable' : 'Session Feedback'}</h3>
                      <p className={`${feedbackError ? 'text-red-600' : 'text-indigo-600'} text-sm`}>Goal: {selectedScenario.coachingGoal}</p>
                   </div>
                   
                   {isGeneratingFeedback ? (
                      <div className="p-12 flex flex-col items-center justify-center text-slate-500">
                         <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                         <p className="font-medium">Analyzing your conversation...</p>
                      </div>
                   ) : feedbackError ? (
                      <div className="p-8 text-center space-y-4">
                         <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-500">
                           <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                         </div>
                         <p className="text-slate-700">{feedbackError}</p>
                         <button 
                            onClick={resetSession}
                            className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium mt-4"
                         >
                            Return to Menu
                         </button>
                      </div>
                   ) : feedback && (
                      <div className="p-6 space-y-8">
                         <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 text-indigo-900 italic text-lg leading-relaxed relative">
                            <span className="text-6xl text-indigo-200 absolute -top-4 -left-2 select-none">"</span>
                            {feedback.coach_note}
                         </div>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Radar Chart (Current) */}
                            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                               <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 text-center">Session Balance</h4>
                               <div 
                                 className="w-full h-64 relative overflow-hidden" 
                                 role="img" 
                                 aria-label={`Visual Chart showing your performance: You scored ${feedback.goal_alignment_score} out of 10 in Goal Alignment, ${feedback.clarity_score} in Clarity, ${feedback.empathy_score} in Empathy, and ${feedback.confidence_score} in Confidence.`}
                               >
                                  <div ref={chartRef} className="w-full h-full" />
                               </div>
                            </div>

                            {/* Trend Chart (History) */}
                            {getPracticeHistory(selectedScenario.id).length > 1 && (
                                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 text-center">Your Progress</h4>
                                   <div 
                                     className="w-full h-64 relative overflow-hidden" 
                                     role="img" 
                                     aria-label={`Visual Chart showing your progress: A line graph tracking your Goal Alignment and Confidence scores across your last ${getPracticeHistory(selectedScenario.id).length} practice attempts.`}
                                   >
                                      <div ref={trendChartRef} className="w-full h-full" />
                                   </div>
                                </div>
                            )}
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                               <h4 className="font-bold text-green-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider">
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                 Strengths
                               </h4>
                               <ul className="space-y-3">
                                  {feedback.strengths?.map((s, i) => (
                                     <li key={i} className="text-sm text-slate-700 bg-green-50 px-4 py-3 rounded-xl border border-green-100 flex items-start gap-2">
                                       <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                       {s}
                                     </li>
                                  )) || <li className="text-sm text-slate-500">No strengths detected.</li>}
                               </ul>
                            </div>
                            <div>
                               <h4 className="font-bold text-yellow-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider">
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                 Areas for Growth
                               </h4>
                               <ul className="space-y-3">
                                  {feedback.improvements?.map((s, i) => (
                                     <li key={i} className="text-sm text-slate-700 bg-yellow-50 px-4 py-3 rounded-xl border border-yellow-100 flex items-start gap-2">
                                       <svg className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                       {s}
                                     </li>
                                  )) || <li className="text-sm text-slate-500">No improvements detected.</li>}
                               </ul>
                            </div>
                         </div>
                         
                         <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                            <div>
                               <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Goal Alignment</span>
                               <div className="text-3xl font-bold text-indigo-600">{feedback.goal_alignment_score || 0}<span className="text-lg text-slate-300">/10</span></div>
                            </div>
                            <button 
                               onClick={resetSession}
                               className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold shadow-lg shadow-indigo-200"
                            >
                               Start New Session
                            </button>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          )}
        </div>
      )}

      {/* Bottom Control Area */}
      <div className={`absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center justify-center transition-all z-20 ${isConnected ? 'bg-gradient-to-t from-white via-white to-transparent pt-12 pb-8' : 'bg-white border-t border-slate-100'}`}>
        
        {/* If Disconnected but has chat history (e.g. abrupt disconnect), show 'Analyze' option */}
        {!isConnected && conversation.length > 0 && !feedback && !isGeneratingFeedback && (
            <div className="w-full max-w-lg mb-4">
              <button 
                 onClick={handleDisconnect} // Re-use handleDisconnect to trigger analysis
                 className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg animate-pulse"
              >
                 Analyze Saved Conversation
              </button>
            </div>
        )}

        {isConnected && (
          <div className="w-full max-w-lg flex items-center justify-between gap-4 mb-2">
            
            {/* Mute Button (Autonomy Control) */}
            <button
               onClick={toggleMute}
               className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all ${
                 isMuted 
                 ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' 
                 : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
               }`}
               aria-pressed={isMuted}
            >
               {isMuted ? (
                 <>
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                   Unmute
                 </>
               ) : (
                 <>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    Mute / Pause
                 </>
               )}
            </button>

            {/* End Session (Destructive Action) */}
            <button 
              ref={endButtonRef}
              onClick={handleDisconnect}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200 focus:outline-none focus:ring-4 focus:ring-red-200"
              aria-label="End Session"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              End Session
            </button>
          </div>
        )}

        <div className="flex flex-col items-center w-full">
          {!isConnected && conversation.length === 0 && !feedback && !isGeneratingFeedback && !feedbackError ? (
            <button 
              onClick={connect}
              disabled={status !== "Disconnected" && !status.includes("Error") && !status.includes("Connection Ended")}
              className={`w-full max-w-sm py-4 rounded-2xl font-bold shadow-xl transition-all text-lg flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-indigo-500 ${
                 status !== "Disconnected" && !status.includes("Error") && !status.includes("Connection Ended")
                 ? 'bg-slate-300 text-slate-500 cursor-wait' 
                 : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98]'
              }`}
              aria-label={`Start Session: ${selectedScenario.title}`}
            >
               {status !== "Disconnected" && !status.includes("Error") && !status.includes("Connection Ended") ? (
                 <>Connecting...</>
               ) : (
                 <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Start Practice
                 </>
               )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};