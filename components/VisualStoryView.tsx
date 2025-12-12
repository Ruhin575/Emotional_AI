import React, { useState, useRef } from 'react';
import { generateVisualStoryPlan, generateComicPanel, determineVisualFormat, planVideoGeneration, generateSocialVideo, extractStoryContent } from '../services/gemini';
import { StoryBoard } from '../types';

export const VisualStoryView: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [storyBoard, setStoryBoard] = useState<StoryBoard | null>(null);
  const [panelImages, setPanelImages] = useState<Record<number, string>>({});
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'extracting' | 'deciding' | 'planning_comic' | 'generating_images' | 'planning_video' | 'rendering_video' | 'done'>('idle');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [preferredFormat, setPreferredFormat] = useState<'AUTO' | 'COMIC' | 'VIDEO'>('AUTO');
  const [videoMetadata, setVideoMetadata] = useState<{segments: number, reason: string, type?: string} | null>(null);
  const [determinedFormat, setDeterminedFormat] = useState<'COMIC' | 'VIDEO' | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{name: string, data: string, mimeType: string} | null>(null);
  
  // Progress state for Video
  const [currentSegment, setCurrentSegment] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setUploadedFile({
          name: file.name,
          data: base64String,
          mimeType: file.type
        });
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim() && !uploadedFile) {
      setError("Please provide a story text or upload a file.");
      return;
    }
    
    setError(null);
    setStoryBoard(null);
    setPanelImages({});
    setVideoUrl(null);
    setDeterminedFormat(null);
    setVideoMetadata(null);
    setProgressMsg('');
    setCurrentSegment(0);
    setTotalSegments(0);
    
    try {
      // Step 0: Extract Narrative (if file or complex text)
      setStatus('extracting');
      const narrative = await extractStoryContent(inputText, uploadedFile ? {data: uploadedFile.data, mimeType: uploadedFile.mimeType} : undefined);
      
      if (!narrative) {
        throw new Error("Could not extract a story from the provided input.");
      }

      // Step 1: Decide Format
      let targetFormat = preferredFormat;
      if (targetFormat === 'AUTO') {
        setStatus('deciding');
        targetFormat = await determineVisualFormat(narrative);
      }
      setDeterminedFormat(targetFormat as 'COMIC' | 'VIDEO');

      if (targetFormat === 'VIDEO') {
        // === VIDEO FLOW ===
        
        // Check API Key for Veo (Paid Feature)
        if ((window as any).aistudio) {
           const hasKey = await (window as any).aistudio.hasSelectedApiKey();
           if (!hasKey) {
               await (window as any).aistudio.openSelectKey();
           }
        }
        
        setStatus('planning_video');
        const videoPlan = await planVideoGeneration(narrative);
        setVideoMetadata({ 
           segments: videoPlan.script.length, 
           reason: videoPlan.reason, 
           type: videoPlan.type 
        });
        
        setStatus('rendering_video');
        const url = await generateSocialVideo(
          videoPlan.script, 
          (current, total) => {
             setCurrentSegment(current);
             setTotalSegments(total);
          }
        );
        setVideoUrl(url);

      } else {
        // === COMIC FLOW ===
        setStatus('planning_comic');
        const plan = await generateVisualStoryPlan(narrative);
        setStoryBoard(plan);
        setStatus('generating_images');

        // Generate Images in parallel
        if (plan.panels && Array.isArray(plan.panels)) {
           const imagePromises = plan.panels.map(async (panel) => {
             try {
               const base64 = await generateComicPanel(panel.prompt_for_image);
               setPanelImages(prev => ({ ...prev, [panel.id]: base64 }));
             } catch (e) {
               console.error(`Failed to generate image for panel ${panel.id}`, e);
             }
           });
           await Promise.all(imagePromises);
        } else {
            console.warn("No panels returned in plan", plan);
        }
      }

      setStatus('done');

    } catch (e: any) {
      let msg = e.message || String(e);

      // Check for clean errors first to avoid logging
      if (msg.includes('Veo Quota Exceeded') || msg.includes('429')) {
         console.warn("Veo Quota Hit:", msg);
         msg = "Quota Exceeded (429). The video generation model is busy or you have hit your limits. Please try again later or shorten the story.";
      } else {
         console.error("Visual Story Error:", e);
         // Only append JSON if it's a raw object (not Error) and not a known clean error
         if (typeof e === 'object' && e !== null && !(e instanceof Error)) {
             try {
                msg += " " + JSON.stringify(e);
             } catch {}
         }
      }
      
      // Handle other specific errors
      if (msg.includes('Requested entity was not found') || msg.includes('404') || msg.includes('NOT_FOUND')) {
         msg = "Model Not Found (404). 'Veo' model is not enabled for your key. Please select a valid Paid API Key (GCP Project).";
         if ((window as any).aistudio?.openSelectKey) {
            try { await (window as any).aistudio.openSelectKey(); } catch {}
         }
      } 
      else if (msg.includes('403') || msg.includes('permission') || msg.includes('API key')) {
         msg = "Access Denied (403). Video generation requires a paid API Key. Please select a valid key.";
         if ((window as any).aistudio?.openSelectKey) {
            try { await (window as any).aistudio.openSelectKey(); } catch {}
         }
      }

      setError(msg);
      setStatus('idle');
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto" role="region" aria-label="Visual Story Creator">
      {/* Input Section */}
      <div className="p-6 bg-white border-b border-slate-200">
         <h2 className="text-2xl font-bold text-slate-800 mb-2">Visual Story Mode</h2>
         <p className="text-slate-500 mb-4 text-sm">Paste a story, scenario, or upload a PDF/Text file. We'll visualize it as a comic or a video.</p>
         
         <div className="flex flex-col gap-4">
           <div className="flex justify-between items-start flex-wrap gap-2">
             <div className="flex items-center gap-2">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2 ${uploadedFile ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                 </svg>
                 {uploadedFile ? 'Change File' : 'Upload PDF / Text'}
               </button>
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept=".txt,.md,.pdf" 
                 onChange={handleFileUpload} 
               />
               {uploadedFile && (
                 <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded text-xs text-slate-600">
                    <span className="truncate max-w-[150px]">{uploadedFile.name}</span>
                    <button onClick={clearFile} className="text-slate-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                 </div>
               )}
             </div>

             <div className="flex flex-col items-end gap-2">
               {/* Format Selector */}
               <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                 <button 
                   onClick={() => setPreferredFormat('AUTO')}
                   aria-label="Auto select format"
                   title="Auto"
                   className={`px-3 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${preferredFormat === 'AUTO' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                   <span className="hidden sm:inline">Auto</span>
                 </button>
                 <button 
                   onClick={() => setPreferredFormat('COMIC')}
                   aria-label="Comic Format"
                   title="Comic"
                   className={`px-3 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${preferredFormat === 'COMIC' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                   <span className="hidden sm:inline">Comic</span>
                 </button>
                 <button 
                   onClick={() => setPreferredFormat('VIDEO')}
                   aria-label="Video Format (Veo)"
                   title="Video (Veo)"
                   className={`px-3 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${preferredFormat === 'VIDEO' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                   <span className="hidden sm:inline">Video</span>
                 </button>
               </div>
             </div>
           </div>

           <label htmlFor="story-input" className="sr-only">Story Text</label>
           <textarea
             id="story-input"
             className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none bg-slate-50 h-32"
             placeholder={uploadedFile ? `Analyzing content from ${uploadedFile.name}... (You can add extra context here)` : "Paste story text here..."}
             value={inputText}
             onChange={(e) => setInputText(e.target.value)}
             aria-label="Paste your story text here"
           />
           <button
             onClick={handleGenerate}
             disabled={status !== 'idle' && status !== 'done'}
             className={`self-end px-6 py-3 rounded-xl font-bold text-white shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
               status === 'idle' || status === 'done'
                 ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-xl' 
                 : 'bg-slate-400 cursor-not-allowed'
             }`}
           >
             {status === 'idle' || status === 'done' ? 'Visualize Story' : 'Processing...'}
           </button>
         </div>
         {error && <p className="text-red-500 mt-2 text-sm bg-red-50 p-3 rounded-lg border border-red-100" role="alert">{error}</p>}
      </div>

      {/* Output Section */}
      <div className="p-6 flex-1">
        {status !== 'idle' && status !== 'done' && (
           <div className="flex flex-col items-center justify-center h-64 text-indigo-600 font-medium space-y-4 animate-fade-in" role="status">
             <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
             </div>
             
             {status === 'rendering_video' ? (
                <div className="w-full max-w-md text-center">
                   <p className="text-lg font-bold text-slate-700 mb-2">Generating Video with Veo</p>
                   <p className="text-sm text-slate-500 mb-4">This may take a while. Keep this window open and you can come back to it later.</p>
                   
                   {totalSegments > 0 && (
                      <>
                        <p className="text-sm font-bold text-indigo-600 mb-2">{currentSegment} out of {totalSegments} segments completed</p>
                        <div className="w-full bg-black rounded-full h-4 overflow-hidden border border-slate-200 shadow-inner">
                           <div 
                             className="bg-blue-600 h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(37,99,235,0.5)]" 
                             style={{ width: `${(currentSegment / totalSegments) * 100}%` }}
                           ></div>
                        </div>
                      </>
                   )}
                </div>
             ) : (
                <p className="animate-pulse text-lg text-center max-w-md">
                   {status === 'extracting' && "Reading & summarizing content..."}
                   {status === 'deciding' && "Analyzing content complexity..."}
                   {status === 'planning_comic' && "Drafting comic storyboard..."}
                   {status === 'generating_images' && "Drawing panels (Gemini 2.5 Flash)..."}
                   {status === 'planning_video' && "Writing script & shot list..."}
                </p>
             )}
           </div>
        )}

        {/* Video Result */}
        {videoUrl && (
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-slate-900 aspect-video w-full flex items-center justify-center relative">
              <video 
                src={videoUrl} 
                controls 
                autoPlay 
                loop
                className="w-full h-full object-contain"
                aria-label="Generated video summary of your story"
              />
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                   <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded uppercase">Veo 3 Generated</span>
                   <span className="text-xs text-slate-400">720p • 16:9 • {videoMetadata?.segments ? `~${videoMetadata.segments * 8}s` : 'Dynamic'}</span>
                   {videoMetadata?.type && (
                     <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${videoMetadata.type === 'STORY' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {videoMetadata.type}
                     </span>
                   )}
                 </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-800">Video Summary</h3>
              {videoMetadata && (
                <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                   <p className="text-sm text-slate-700 font-medium">AI Director's Note:</p>
                   <p className="text-sm text-slate-600 italic">"{videoMetadata.reason}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comic Result */}
        {storyBoard && (
          <div className="grid gap-8 max-w-4xl mx-auto" role="list" aria-label="Comic panels">
            <div className="text-center mb-4">
               <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">Comic Mode Selected</span>
            </div>
            {storyBoard.panels?.map((panel) => (
              <div key={panel.id} className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col md:flex-row" role="listitem">
                {/* Image Area */}
                <div className="md:w-1/2 bg-slate-100 min-h-[300px] flex items-center justify-center relative">
                  {panelImages[panel.id] ? (
                    <img 
                      src={panelImages[panel.id]} 
                      alt={`Illustration for panel ${panel.id}: ${panel.summary}.`} 
                      className="w-full h-full object-cover animate-fade-in"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400" role="status" aria-label="Loading image">
                       <svg className="animate-spin h-8 w-8 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                       <span>Generating panel...</span>
                    </div>
                  )}
                </div>

                {/* Content Area */}
                <div className="p-6 md:w-1/2 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="text-xl font-bold text-slate-800">Panel {panel.id}: {panel.title}</h3>
                       <div className="flex gap-1 flex-wrap" aria-label="Detected Emotions">
                         {panel.emotions.map((emo, i) => (
                           <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                             {emo}
                           </span>
                         ))}
                       </div>
                    </div>
                    <p className="text-slate-600 mb-4">{panel.summary}</p>
                    
                    {panel.dialogue_captions.length > 0 && (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Key Dialogue</h4>
                        <ul className="space-y-1">
                          {panel.dialogue_captions.map((line, idx) => (
                            <li key={idx} className="text-sm font-medium text-slate-800 italic">"{line}"</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400 font-mono line-clamp-2" aria-hidden="true">
                      Prompt: {panel.prompt_for_image}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};