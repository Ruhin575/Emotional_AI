
export interface Lens {
  name: string;
  prob: number; // 0 to 1
  meaning: string;
  risk: number; // 1 to 10
}

export interface SocialAnalysis {
  lenses: Lens[];
  context_note: string;
  safe_replies: string[];
  nt_translation: string;
  overall_risk: number;
}

export interface DraftAnalysis {
  risk_score: number;
  critique: string;
  better_variants: string[];
}

export interface AnalysisHistoryItem {
  id: string;
  input: string;
  relationship: string;
  analysis: SocialAnalysis;
  timestamp: Date;
}

export enum MessageType {
  USER = 'user',
  MODEL = 'model',
}

export interface ChatMessage {
  id: string;
  role: MessageType;
  text: string;
  timestamp: Date;
}

export interface StoryPanel {
  id: number;
  title: string;
  summary: string;
  prompt_for_image: string;
  dialogue_captions: string[];
  emotions: string[];
}

export interface StoryBoard {
  panels: StoryPanel[];
}

export interface PracticeFeedback {
  strengths: string[];
  improvements: string[];
  goal_alignment_score: number;
  clarity_score: number;
  empathy_score: number;
  confidence_score: number;
  coach_note: string;
}

export interface GuardianSignal {
  signal: 'none' | 'mild' | 'attention' | 'caution';
  reason: string;
  gentle_hint?: string;
  confidence_note?: string;
  risk_trend: 'stable' | 'rising' | 'easing';
  suggested_action?: string;
}
