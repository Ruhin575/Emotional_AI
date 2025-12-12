import { GoogleGenAI, Type, Modality, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import { SocialAnalysis, StoryBoard, AnalysisHistoryItem, PracticeFeedback, DraftAnalysis, GuardianSignal } from '../types';

const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to clean Markdown code blocks from JSON strings
const cleanAndParseJSON = <T>(text: string): T => {
  try {
    // Remove ```json ... ``` or ``` ... ``` wrappers
    let cleanText = text.replace(/```json\n?|```\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as T;
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    throw new Error("Failed to parse AI response format.");
  }
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// System instruction for the Social Interpreter
const SYSTEM_INSTRUCTION = `
You are Emotional AI, a social decoder for neurodivergent users.
Your goal is to prevent miscommunication and anxiety by decoding social subtext.
Analyze the provided input (text, audio, or image) and recent context.

CRITICAL CONTEXT: The user's relationship to the speaker is "\${relationship}".

### NARRATIVE & PERSONA GUIDELINES (CRITICAL)
1. **Second-Person Perspective**: Always address the user directly as "You". Never use "The user". 
   - CORRECT: "They are asking you to..."
   - INCORRECT: "The speaker is asking the user..."
2. **Personalized Connection**: Be warm, supportive, and direct. Act like a trusted friend whispering advice.
3. **Conciseness**: Avoid academic or clinical language. Be brief.

### POWER DYNAMICS & FORMALITY PROTOCOL
Calibrate analysis based on the "\${relationship}" dynamic:

1. **High Power / Authority**: Risk is ELEVATED. Ambiguity = Polite command. Replies: HIGH FORMALITY.
2. **Peer / High Trust**: Risk is LOWERED. Sarcasm = Playful. Replies: LOW FORMALITY.
3. **Intimate / Emotional**: Risk is VARIABLE. Look for connection bids. Replies: HIGH EMPATHY.
4. **Transactional / Distant**: Risk is MEDIUM. Stick to norms. Replies: POLITE NEUTRALITY.

### OUTPUT REQUIREMENTS
Output ONLY valid JSON with this structure:
{
  "lenses": [
    {"name": "Lens Name", "prob": 0.0-1.0, "meaning": "Brief snippet (max 5 words)", "risk": 1-10}
  ],
  "context_note": "A short, direct observation using 'You'. e.g. 'Since they are your boss, this tone implies urgency.'",
  "safe_replies": [
    "Option 1: [Primary response matching the calibrated formality]",
    "Option 2: [Clarification question (gentle inquiry)]",
    "Option 3: [Boundary setting or Defusing]"
  ],
  "nt_translation": "Direct translation of the subtext in 2nd person. Start with 'They mean...' or 'They are feeling...'. Keep it under 2 sentences.",
  "overall_risk": 5 // Max risk of the dominant lenses (1-10)
}
`;

export const analyzeSocialCues = async (
  input: string,
  relationship: string,
  history: AnalysisHistoryItem[] = [],
  imagePart?: { data: string; mimeType: string },
  audioPart?: { data: string; mimeType: string }
): Promise<SocialAnalysis> => {
  const ai = getClient();
  
  const parts: any[] = [];
  
  if (imagePart) {
    parts.push({
      inlineData: {
        data: imagePart.data,
        mimeType: imagePart.mimeType,
      },
    });
  }

  if (audioPart) {
    parts.push({
      inlineData: {
        data: audioPart.data,
        mimeType: audioPart.mimeType,
      },
    });
  }

  // Construct context string from history
  let promptText = input || "Analyze the attached media for social cues.";
  
  // Add Relationship Context explicitly
  const relationshipContext = `RELATIONSHIP CONTEXT: The speaker is the user's "${relationship || 'Stranger'}". Interpret the tone and risk accordingly.`;
  
  let historyContext = "";
  if (history.length > 0) {
    historyContext = history.slice(0, 5).reverse().map(h => 
      `[Past Turn - Relationship: ${h.relationship}] User: "${h.input}" -> Analysis: ${h.analysis?.nt_translation || 'N/A'} (Context: ${h.analysis?.context_note || 'N/A'})`
    ).join("\n");
    promptText = `${relationshipContext}\n\nPREVIOUS CONTEXT (Last ${history.length} turns):\n${historyContext}\n\nCURRENT INPUT TO ANALYZE:\n${promptText}`;
  } else {
    promptText = `${relationshipContext}\n\nCURRENT INPUT TO ANALYZE:\n${promptText}`;
  }

  // Always add text prompt or context
  parts.push({
    text: promptText,
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION.replace(/\${relationship}/g, relationship || 'Stranger'),
        responseMimeType: "application/json",
        // Using a schema for strict type adherence
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            lenses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  prob: { type: Type.NUMBER },
                  meaning: { type: Type.STRING },
                  risk: { type: Type.NUMBER },
                },
                required: ["name", "prob", "meaning", "risk"],
              },
            },
            context_note: { type: Type.STRING },
            safe_replies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            nt_translation: { type: Type.STRING },
            overall_risk: { type: Type.NUMBER },
          },
          required: ["lenses", "context_note", "safe_replies", "nt_translation", "overall_risk"]
        },
        thinkingConfig: { thinkingBudget: 4096 } 
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    const result = cleanAndParseJSON<SocialAnalysis>(text);
    
    // Validate result structure to prevent UI crashes
    if (!result.lenses || !Array.isArray(result.lenses)) {
       throw new Error("Analysis failed to generate valid lenses.");
    }
    
    return result;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to analyze social cues.");
  }
};

// === DRAFT REPLY ANALYSIS ===
const DRAFT_INSTRUCTION = `
You are a social communication coach.
Analyze the user's DRAFT REPLY to a specific INPUT MESSAGE within a specific RELATIONSHIP context.

Assess the social risk (1-10) of sending this draft.
1 = Safe, polite, appropriate.
10 = High risk of offense, misunderstanding, or firing.

Provide a constructive critique explaining the tone/impression.
Provide 3 alternative versions:
1. Polished (Same intent, better phrasing)
2. Softer (More polite/deferential)
3. Firmer (More assertive, boundary-setting)

Output valid JSON.
`;

export const analyzeDraftReply = async (originalInput: string, relationship: string, draftReply: string): Promise<DraftAnalysis> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [{
        text: `ORIGINAL MESSAGE: "${originalInput}"
RELATIONSHIP: ${relationship}
USER'S DRAFT REPLY: "${draftReply}"

Analyze the draft reply.`
      }]
    },
    config: {
      systemInstruction: DRAFT_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          risk_score: { type: Type.NUMBER },
          critique: { type: Type.STRING },
          better_variants: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["risk_score", "critique", "better_variants"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to analyze draft.");
  return cleanAndParseJSON<DraftAnalysis>(text);
}

export const generateSpeech = async (text: string): Promise<string> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: { parts: [{ text }] },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, 
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate speech");
  return base64Audio;
};

export const generateVisualMetaphor = async (prompt: string, size: "1K" | "2K" | "4K" = "1K"): Promise<string> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `Create a realistic, human-centric illustration representing this social/emotional concept: ${prompt}. Use expressive, relatable human figures or clear symbolic imagery. The style should be warm, clear, and easy to interpret, avoiding overly abstract or chaotic elements.`,
        },
      ],
    },
    config: {
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

const STORY_PLAN_INSTRUCTION = `
You are an expert storyboard artist and emotional interpreter.
Your task is to take a long text or story and summarize it into 3-4 key emotional scenes (panels).

CRITICAL INSTRUCTION FOR DIALOGUE:
- You MUST use the EXACT dialogue/spoken words provided in the source text for the "dialogue_captions".
- Do NOT rewrite, paraphrase, or alter the dialogue.
- Use the direct quotes from the text.

For each scene, provide a title, a brief summary, a detailed image generation prompt for a comic style panel, dialogue captions (verbatim from text), and a list of dominant emotions.
The image prompt MUST specify "Realistic comic style with clear, expressive human faces" and describe the visual elements detailedly (characters, setting, expression, lighting, colors).
Output valid JSON matching the schema.
`;

export const generateVisualStoryPlan = async (text: string): Promise<StoryBoard> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash', 
    contents: {
      role: 'user',
      parts: [{ text: `Create a visual story plan for the following text:\n\n${text}` }]
    },
    config: {
      systemInstruction: STORY_PLAN_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          panels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                prompt_for_image: { type: Type.STRING },
                dialogue_captions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                emotions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["id", "title", "summary", "prompt_for_image", "dialogue_captions", "emotions"]
            }
          }
        }
      }
    }
  });

  const responseText = response.text;
  if (!responseText) throw new Error("No response from Gemini");
  const result = cleanAndParseJSON<StoryBoard>(responseText);
  
  if (!result.panels || !Array.isArray(result.panels)) {
     throw new Error("Failed to generate story panels.");
  }
  
  return result;
}

export const generateComicPanel = async (prompt: string): Promise<string> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
}

export const extractStoryContent = async (text: string, file?: { data: string; mimeType: string }): Promise<string> => {
  const ai = getClient();
  const parts: any[] = [];
  if (file) {
    parts.push({ inlineData: { data: file.data, mimeType: file.mimeType } });
  }
  if (text) {
    parts.push({ text });
  }
  if (parts.length === 0) return "";

  parts.push({ text: "Extract the main story/narrative from the above content. Return it as clear, plain text. CRITICAL: Preserve all dialogue and spoken quotes exactly as they appear in the source." });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts },
  });
  return response.text || "";
}

export const determineVisualFormat = async (text: string): Promise<'VIDEO' | 'COMIC'> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [{ text: `Analyze the following text. Does it describe a complex scene with significant motion, transitions, high complexity, or specific audio atmosphere that is best conveyed by a video? Or is it a narrative sequence best suited for a static comic strip?
      
      Text: "${text.substring(0, 1500)}..."
      
      If it is long, complex, or implies motion/animation, choose VIDEO.
      If it is a simple dialogue or sequence of static moments, choose COMIC.
      
      Return JSON: { "format": "VIDEO" | "COMIC", "reason": "..." }` }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
         type: Type.OBJECT,
         properties: {
            format: { type: Type.STRING, enum: ["VIDEO", "COMIC"] },
            reason: { type: Type.STRING }
         }
      }
    }
  });
  
  const result = cleanAndParseJSON<{format?: 'VIDEO'|'COMIC'}>(response.text || '{}');
  return result.format || 'COMIC';
};

interface VideoPlan {
  script: string[];
  type: string;
  reason: string;
}

export const planVideoGeneration = async (text: string): Promise<VideoPlan> => {
   const ai = getClient();
   const response = await ai.models.generateContent({
     model: 'gemini-2.5-flash',
     contents: { parts: [{ text: `
     Role: Expert Video Producer & Educational Designer for Neurodiverse Audiences.
     Task: Analyze the text and create a comprehensive video production script.
     
     1. **Content Strategy**:
        - **SUMMARIZE**: Create a concise summary of the story/content covering all main important points. Do NOT output the full story verbatim.
        - **DIALOGUE**: Include ONLY significant, plot-driving dialogue. Remove random or filler dialogue.
        - **ACCURACY**: Avoid hallucinations. Stick strictly to the provided input.
        
     2. **Visual Style (Neurodiverse Optimized)**:
        - High-quality graphics and animation.
        - Clean, clear visuals. Avoid chaotic or overwhelming sensory details.
        - Consistent character designs and settings.
        - Use visual metaphors for abstract concepts.
     
     3. **Breakdown**: 
        - Split the content into a sequence of video segments.
        - Each segment represents ~8 seconds of video.
        - **LIMIT**: Maximum 30 segments (approx 4 minutes). The summary MUST fit within this limit.
     
     4. **Scripting**: Write a highly descriptive video generation prompt (max 400 chars) for EACH segment.
        - Prompts should describe the visual style, subject, action, lighting, and setting.
     
     Input Text: "${text.substring(0, 25000)}"
     
     Return JSON: 
     { 
       "script": [ "prompt for seg 1", "prompt for seg 2", ... ], 
       "type": "STORY" or "LECTURE", 
       "reason": "Explanation of the approach" 
     }
     ` }] },
     config: {
       responseMimeType: "application/json",
       responseSchema: {
         type: Type.OBJECT,
         properties: {
           script: { type: Type.ARRAY, items: { type: Type.STRING } },
           type: { type: Type.STRING },
           reason: { type: Type.STRING }
         },
         required: ["script", "type", "reason"]
       }
     }
   });
   
   const res = cleanAndParseJSON<{script?: string[], type?: string, reason?: string}>(response.text || '{}');
   return {
      script: res.script || ["Cinematic shot of the main concept."],
      type: res.type || "UNKNOWN",
      reason: res.reason || "Generated based on content."
   };
}

export const generateSocialVideo = async (script: string[], onProgress?: (current: number, total: number) => void): Promise<string> => {
  const ai = getClient();
  
  // Cap at 30 segments (approx 4 mins) as requested
  const safeScript = script.slice(0, 30);
  const model = 'veo-3.1-generate-preview';
  
  let currentVideo: any = null;

  for (let i = 0; i < safeScript.length; i++) {
     const prompt = safeScript[i];
     if (onProgress) onProgress(i + 1, safeScript.length);

     let operation: any = null;
     let attempts = 0;
     const maxAttempts = 10; // Increased attempts from 5 to 10 for better resilience
     let success = false;

     // Retry Loop
     while (attempts < maxAttempts && !success) {
        try {
             if (i === 0) {
               operation = await ai.models.generateVideos({
                 model: model,
                 prompt: prompt,
                 config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
               });
             } else {
               // Extension
               operation = await ai.models.generateVideos({
                 model: model,
                 prompt: prompt, 
                 video: currentVideo,
                 config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
               });
             }
             success = true;
        } catch (e: any) {
             attempts++;
             
             let isRateLimit = false;

             // 1. Check raw object properties if available
             if (typeof e === 'object' && e !== null) {
               if (e.code === 429 || e.status === 429) isRateLimit = true;
               if (e.error?.code === 429 || e.error?.status === 'RESOURCE_EXHAUSTED') isRateLimit = true;
               if (e.status === 'RESOURCE_EXHAUSTED') isRateLimit = true;
             }

             // 2. Check message string
             const msg = e.message || JSON.stringify(e);
             if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) isRateLimit = true;

             if (isRateLimit && attempts < maxAttempts) {
                 // Aggressive Exponential Backoff: 15s, 30s, 60s, 90s, 120s...
                 const delay = Math.min(15000 * Math.pow(2, attempts - 1), 120000); 
                 console.warn(`Veo 429 Error at segment ${i+1}. Attempt ${attempts}/${maxAttempts}. Retrying in ${delay/1000}s...`);
                 await wait(delay);
             } else {
                 console.error("Non-retriable Veo error or max attempts reached:", e);
                 // If we have a video already, we stop here and return what we have
                 if (currentVideo) {
                    console.info("Returning partial video due to error.");
                    success = false; 
                    break; 
                 }
                 
                 // If failure is a rate limit but we exhausted retries, throw a clean message
                 if (isRateLimit) {
                    throw new Error("Veo Quota Exceeded: The model is currently overloaded or you have hit your rate limit. Please try again later.");
                 }
                 
                 // Otherwise throw original info
                 throw new Error(`Veo Generation Failed: ${msg}`);
             }
        }
     }

     if (!success) {
         // Retry loop finished without success (exhausted retries or non-retriable)
         if (currentVideo) break; // Exit main loop, return partial video
         // If currentVideo is null, we threw inside the retry loop catch block already, but just in case:
         if (!currentVideo) throw new Error("Video generation failed at start.");
         break; 
     }

     // Polling
     try {
         while (!operation.done) {
             await wait(10000); 
             operation = await ai.operations.getVideosOperation({operation: operation});
         }
     } catch (e: any) {
         console.error("Polling error:", e);
         if (currentVideo) break; // Return partial
         throw e;
     }

     const newVideo = operation.response?.generatedVideos?.[0]?.video;
     if (!newVideo) {
         if (currentVideo) break; 
         throw new Error(`Video generation failed at segment ${i + 1}`);
     }
     
     currentVideo = newVideo;
     
     // Increased Safety delay (15s) to let bucket refill
     if (i < safeScript.length - 1) {
        await wait(15000);
     }
  }

  if (!currentVideo) throw new Error("No video content generated.");

  try {
    const videoUri = currentVideo.uri;
    const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    if (!response.ok) throw new Error("Failed to download video data.");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (e: any) {
      throw new Error(`Download Failed: ${e.message}`);
  }
}

export function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clipping to avoid distortion
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  
  // Optimized loop for binary string creation
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const generatePracticeFeedback = async (transcript: string, goal: string, scenario: string): Promise<PracticeFeedback> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      role: 'user',
      parts: [{ text: `Analyze this roleplay session transcript.\n\nSCENARIO: "${scenario}"\nUSER GOAL: "${goal}"\n\nTRANSCRIPT:\n${transcript}` }]
    },
    config: {
      systemInstruction: `
      You are an expert social skills coach specializing in neurodiversity.
      Your task is to provide a rigorous, balanced, and actionable post-session analysis.
      
      CONTEXT: The user has just completed a roleplay exercise with an AI based on the scenario: "${scenario}".
      
      ANALYSIS GUIDELINES:
      1. **Contextual Evaluation**: Compare the user's performance against the specific constraints and context of the SCENARIO. Did they adapt to the situation described?
      2. **Balanced Feedback**: You MUST provide both strengths and specific areas for improvement based on both the TRANSCRIPT and the SCENARIO demands.
         - **Do not** simply say "You did great" if there are missed opportunities.
         - **Do not** output "No improvements detected". Always find a nuance to polish (e.g., tone, conciseness, empathy, pausing).
      3. **Scoring**: Be realistic. 
         - 10/10 is reserved for perfection. 
         - Average attempts should be 5-7. 
         - Be honest so the user can track genuine progress.
      4. **Direct Address**: Always address the user as "You".
      
      Output strictly valid JSON.
      `,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          goal_alignment_score: { type: Type.NUMBER },
          clarity_score: { type: Type.NUMBER },
          empathy_score: { type: Type.NUMBER },
          confidence_score: { type: Type.NUMBER },
          coach_note: { type: Type.STRING }
        },
        required: ["strengths", "improvements", "goal_alignment_score", "clarity_score", "empathy_score", "confidence_score", "coach_note"]
      },
      thinkingConfig: { thinkingBudget: 2048 }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No feedback generated");
  return cleanAndParseJSON<PracticeFeedback>(text);
}

export const liveConnect = async (
  context: { scenario: string, goal: string },
  onOpen: () => void,
  onMessage: (msg: any) => void,
  onClose: () => void,
  onError: (err: any) => void
) => {
  const ai = getClient();

  const systemInstruction = `
  You are an expert acting partner and social skills coach.
  
  CURRENT SCENARIO: ${context.scenario}
  PRACTICE GOAL: ${context.goal}
  
  INSTRUCTIONS:
  1. ADOPT THE PERSONA: Be fully immersed in the scenario described above.
  2. BE HUMAN: Speak naturally. Use fillers (um, uh, hmm) occasionally. React emotionally to what the user says. Do not sound robotic.
  3. CONVERSATIONAL FLOW: Keep the conversation going naturally. Ask follow-up questions.
  4. ACCOMMODATE SPEECH PATTERNS: The user may speak slowly, pause frequently, or repeat phrases (echolalia/stuttering).
     - Do NOT interrupt them.
     - Wait for a complete thought before responding. If they pause, wait a beat to ensure they are done.
     - Ignore background noise.
  5. COACHING MODE (TRIGGER: "Time out", "Pause", "Feedback"):
     - Break character immediately.
     - Address the user directly as "You".
     - Explicitly reference the PRACTICE GOAL: "${context.goal}".
     - Evaluate how well the user met this specific goal in the recent exchange.
     - Provide 1-2 concrete, actionable tips to improve on this goal.
     - Keep it encouraging and non-judgmental.
     - Ask if they are ready to resume the scenario.
  
  Your goal is to provide a safe, realistic space for the user to practice this specific social skill.
  `;

  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      inputAudioTranscription: {}, 
      outputAudioTranscription: {},
      systemInstruction: systemInstruction,
    },
    callbacks: {
      onopen: onOpen,
      onmessage: onMessage,
      onclose: onClose,
      onerror: onError,
    },
  });
};

const guardianToolDeclaration: FunctionDeclaration = {
  name: 'update_guardian_status',
  description: 'Updates the conversation guardian status with private, non-interruptive guidance.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      signal: { type: Type.STRING, enum: ['none', 'mild', 'attention', 'caution'] },
      reason: { type: Type.STRING },
      gentle_hint: { type: Type.STRING },
      confidence_note: { type: Type.STRING },
      risk_trend: { type: Type.STRING, enum: ['stable', 'rising', 'easing'] },
      suggested_action: { type: Type.STRING, description: "Specific phrase or behavioral strategy to de-escalate or pivot the conversation if risk is high." }
    },
    required: ['signal', 'reason', 'risk_trend']
  }
};

export const connectGuardian = async (
  relationship: string,
  onOpen: () => void,
  onStatusUpdate: (status: GuardianSignal) => void,
  onTranscript: (role: 'user' | 'model', text: string) => void,
  onClose: () => void,
  onError: (err: any) => void
) => {
  const ai = getClient();

  const systemInstruction = `
  You are a Real-Time Conversation Guardian.
  You listen to an ongoing live conversation silently in the background and provide private, non-interruptive guidance to the user.
  
  CONTEXT: The user's relationship to the other speaker is: "${relationship}".
  
  YOUR GOAL: Reduce anxiety, prevent miscommunication, and preserve the user’s autonomy.
  
  AUDIO & PROCESSING GUIDELINES (CRITICAL):
  1. **SPEAKER IDENTIFICATION (2-PARTY)**: 
     - DIFFERENTIATE between the 'User' (your protected client) and the 'Other' (${relationship}).
     - Identify the 'User' as the voice closer to the microphone or the one whose perspective aligns with the need for guidance.
     - If uncertain, track the conversation flow contextually rather than assigning rigid labels instantly.
  
  2. **EXTENDED LISTENING & PAUSE HANDLING**:
     - The user may have neurodiverse speech patterns, including irregular rhythms, stuttering, or **long pauses (up to 10 seconds)** while processing information.
     - **DO NOT** assume a pause is the end of a turn. 
     - **WAIT** for grammatically complete sentences before forming an analysis. 
  
  3. **NOISE FILTERING**: 
     - Aggressively ignore non-speech sounds (typing, breathing, background chatter, screen readers). 
  
  RULES:
  1. NEVER speak out loud. Always use the 'update_guardian_status' tool to communicate.
  2. Continuously infer social signals: emotional shifts, boundary setting, tension, or disengagement.
  3. Track risk trend, not single phrases.
  4. Apply relationship-aware interpretation.
  5. Output short, calm, private cues. Do NOT narrate the whole analysis.
  6. Do NOT interrupt unless risk meaningfully rises.
  7. Prefer uncertainty ("might", "could be") over certainty.
  8. Validate the user first, guide second.
  9. PROACTIVE INTERVENTION: If the signal is 'attention' or 'caution', you MUST provide a 'suggested_action'.
     - This must be a concrete, polite phrase or specific action.
     - Examples: "Ask to pause", "Say: 'Let me think about that'", "Say: 'I need a moment to process'", "Internal Check: Breathe".
  
  If everything is going well, you can update with 'none' or 'mild' signals occasionally to reassure the user.
  `;

  // Accumulate transcripts locally
  let currentInputTrans = "";
  let currentOutputTrans = "";

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    config: {
      responseModalities: [Modality.AUDIO], 
      tools: [{ functionDeclarations: [guardianToolDeclaration] }],
      systemInstruction: systemInstruction,
      inputAudioTranscription: {}, 
      outputAudioTranscription: {},
    },
    callbacks: {
      onopen: onOpen,
      onmessage: async (message: LiveServerMessage) => {
        // Handle Transcription
        if (message.serverContent?.inputTranscription) {
           currentInputTrans += message.serverContent.inputTranscription.text;
        }
        if (message.serverContent?.outputTranscription) {
           currentOutputTrans += message.serverContent.outputTranscription.text;
        }
        if (message.serverContent?.turnComplete) {
           if (currentInputTrans.trim()) {
             onTranscript('user', currentInputTrans.trim());
             currentInputTrans = "";
           }
           if (currentOutputTrans.trim()) {
             // Guardian is silent usually, but if it speaks for some reason, we capture it.
             onTranscript('model', currentOutputTrans.trim());
             currentOutputTrans = "";
           }
        }

        // Handle Tools
        if (message.toolCall) {
          for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'update_guardian_status') {
               const signalData = fc.args as unknown as GuardianSignal;
               onStatusUpdate(signalData);
               
               sessionPromise.then(session => {
                 session.sendToolResponse({
                   functionResponses: {
                     id: fc.id,
                     name: fc.name,
                     response: { result: "acknowledged" }
                   }
                 }).catch((e: any) => {
                    console.warn("Tool response send error", e);
                 });
               });
            }
          }
        }
      },
      onclose: onClose,
      onerror: onError,
    },
  });
  
  return sessionPromise;
};