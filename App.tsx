import React, { useState } from 'react';
import { AnalyzerView } from './components/AnalyzerView';
import { LivePracticeView } from './components/LivePracticeView';
import { ImageGenerationView } from './components/ImageGenerationView';
import { VisualStoryView } from './components/VisualStoryView';
import { ConversationGuardianView } from './components/ConversationGuardianView';
import { FeedbackModal } from './components/FeedbackModal';

enum Tab {
  ANALYZER = 'analyzer',
  PRACTICE = 'practice',
  VISUALS = 'visuals',
  STORY = 'story',
  GUARDIAN = 'guardian',
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.ANALYZER);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const TabButton = ({ tab, label, icon }: { tab: Tab; label: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(tab)}
      aria-current={activeTab === tab ? 'page' : undefined}
      aria-label={label}
      title={label}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        activeTab === tab
          ? 'bg-indigo-600 text-white shadow-md transform scale-105'
          : 'bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 border border-transparent hover:border-indigo-100'
      }`}
    >
      <div className="w-6 h-6 flex items-center justify-center">{icon}</div>
      <span className="whitespace-nowrap font-bold text-sm hidden md:inline-block">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/50">
      <div className="w-full max-w-6xl mx-auto flex flex-col h-[100dvh] md:h-screen md:py-6">
        
        {/* Main Card Container */}
        <div className="flex-1 flex flex-col bg-white md:rounded-3xl shadow-2xl overflow-hidden border border-slate-200/60">
          
          {/* Header & Nav */}
          <header className="bg-white border-b border-slate-100 p-4 md:p-6 z-20 flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-3 self-start md:self-auto">
               <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3M3.343 15.657l-.707.707m16.514-.707l-.707-.707M6 12a6 6 0 1112 0 6 6 0 01-12 0z" />
                 </svg>
               </div>
               <div>
                 <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 leading-tight">Emotional AI</h1>
                 <p className="text-slate-500 text-xs font-medium">Neurodiverse Social Interpreter</p>
               </div>
             </div>

             {/* Navigation Tabs - Icons prioritized for visual scanning */}
             <nav className="w-full md:w-auto flex overflow-x-auto md:flex-wrap justify-between md:justify-end gap-2 p-1 no-scrollbar" role="navigation" aria-label="Main Navigation">
                <TabButton 
                  tab={Tab.ANALYZER} 
                  label="Decoder" 
                  icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} 
                />
                <TabButton 
                  tab={Tab.PRACTICE} 
                  label="Practice" 
                  icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>} 
                />
                <TabButton 
                  tab={Tab.GUARDIAN} 
                  label="Guardian" 
                  icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>} 
                />
                <TabButton 
                  tab={Tab.VISUALS} 
                  label="Metaphors" 
                  icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} 
                />
                <TabButton 
                  tab={Tab.STORY} 
                  label="Visual Story" 
                  icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>} 
                />
             </nav>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 bg-slate-50 overflow-hidden relative" role="main" id="main-content">
            <div className="h-full overflow-y-auto custom-scrollbar">
              {activeTab === Tab.ANALYZER && <AnalyzerView />}
              {activeTab === Tab.PRACTICE && <LivePracticeView />}
              {activeTab === Tab.GUARDIAN && <ConversationGuardianView />}
              {activeTab === Tab.VISUALS && <ImageGenerationView />}
              {activeTab === Tab.STORY && <VisualStoryView />}
            </div>
          </main>

          {/* Footer */}
          <footer className="bg-white p-3 border-t border-slate-100 text-slate-400 text-[10px] md:text-xs flex justify-between items-center shrink-0">
            <p>Powered by Gemini 3 Pro • Designed for Neurodiversity</p>
            <button 
              onClick={() => setIsFeedbackOpen(true)}
              className="text-indigo-500 hover:text-indigo-700 font-bold hover:underline px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Feedback
            </button>
          </footer>
        </div>
      </div>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </div>
  );
};

export default App;