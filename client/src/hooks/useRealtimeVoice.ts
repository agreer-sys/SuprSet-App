import { useEffect, useRef, useState, useCallback } from 'react';

interface RealtimeConfig {
  sessionId: number;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface RealtimeState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}

export function useRealtimeVoice({
  sessionId,
  onTranscript,
  onError,
}: RealtimeConfig) {
  const [state, setState] = useState<RealtimeState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const micPausedForPlaybackRef = useRef(false);
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const needsRestartRef = useRef(false);
  const activeResponseRef = useRef(false); // Track if AI is currently responding
  const eventQueueRef = useRef<Array<{eventName: string, data?: any}>>([]);
  const graceTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track grace period timeout
  const audioDoneCallbacksRef = useRef<Array<() => void>>([]); // Callbacks for audio completion
  
  const responseCounterRef = useRef(0);

  // --- PCM Sanity Ping ---
  function runAudioSanityPing(audioCtx: AudioContext) {
    try {
      const durationSec = 1;
      const sampleRate = audioCtx.sampleRate;
      const length = sampleRate * durationSec;
      const buffer = audioCtx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      // Generate a quick sine tone (220Hz) for audible confirmation
      const freq = 220;
      for (let i = 0; i < length; i++) {
        data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.25;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();

      console.log("✅ Audio sanity ping played successfully (1s tone)");
    } catch (err) {
      console.error("❌ Audio sanity ping failed:", err);
    }
  }

  const connect = useCallback(async () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/realtime?sessionId=${sessionId}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Connected to Realtime API');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'error') {
          console.error('Realtime API error:', message.error);
          setState(prev => ({ ...prev, error: message.error }));
          onError?.(message.error);
        }

        if (message.type === 'session.ready') {
          console.log('🎙️ Session ready');
        }

        // ChatGPT: Reset audio queue on new response
        if (message.type === 'response.created') {
          console.log(`🆕 New response started: ${message.response?.id || 'unknown'}`);
          audioQueueRef.current = []; // clear old data
          isPlayingRef.current = false;
          activeResponseRef.current = true;
        }

        // ChatGPT: Accumulate PCM16 deltas as Float32
        if (message.type === 'response.audio.delta' && message.delta) {
          const audioData = base64ToFloat32Array(message.delta);
          audioQueueRef.current.push(audioData);
        }
        
        // ChatGPT: Play complete response when audio stream is done
        if (message.type === 'response.audio.done') {
          console.log("🎧 Response audio stream complete — starting playback");
          playPcmResponse(); // plays the merged buffer
        }

        if (message.type === 'response.audio_transcript.delta' && message.delta) {
          onTranscript?.(message.delta, false);
        }

        if (message.type === 'response.audio_transcript.done' && message.transcript) {
          onTranscript?.(message.transcript, true);
        }

        if (message.type === 'input_audio_buffer.speech_started') {
          setState(prev => ({ ...prev, isListening: true }));
          
          // Clear auto-stop timeout when user starts speaking
          if (autoStopTimeoutRef.current) {
            clearTimeout(autoStopTimeoutRef.current);
            autoStopTimeoutRef.current = null;
          }
        }

        if (message.type === 'input_audio_buffer.speech_stopped') {
          setState(prev => ({ ...prev, isListening: false }));
        }

        // ChatGPT: Handle response completion
        if (message.type === 'response.done' || message.type === 'response.completed') {
          console.log("✅ Response fully completed");
          setState(prev => ({ ...prev, isSpeaking: false }));
          
          // Only process if not already handled by response.audio.done
          if (activeResponseRef.current) {
            activeResponseRef.current = false;
            
            // Clear grace period timeout
            if (graceTimeoutRef.current) {
              clearTimeout(graceTimeoutRef.current);
              graceTimeoutRef.current = null;
            }
            
            // Trigger any pending audio done callbacks
            audioDoneCallbacksRef.current.forEach(cb => cb());
            audioDoneCallbacksRef.current = [];
            
            // Process next queued event if any
            setTimeout(() => processQueuedEvent(), 100);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({ ...prev, error: 'Connection error' }));
        onError?.('Connection error');
      };

      ws.onclose = () => {
        console.log('🔌 Disconnected from Realtime API');
        setState(prev => ({ ...prev, isConnected: false }));
        cleanup();
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      setState(prev => ({ ...prev, error: 'Failed to connect' }));
      onError?.('Failed to connect');
    }
  }, [sessionId, onTranscript, onError]);

  const startListening = useCallback(async () => {
    try {
      // CRITICAL FIX: Only request getUserMedia if we don't already have a stream
      // Re-requesting on mobile triggers permission popup again
      if (!mediaStreamRef.current) {
        console.log('🎤 Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });
        
        mediaStreamRef.current = stream;
      } else {
        console.log('🎤 Reusing existing microphone stream');
      }

      // Only create audio context if we don't have one
      if (!audioContextRef.current) {
        const audioContext = new AudioContext({ sampleRate: 24000 });
        audioContextRef.current = audioContext;
      }

      // Resume audio context if it was suspended (iOS auto-suspends)
      if (audioContextRef.current.state === 'suspended') {
        console.log('🔄 Resuming suspended audio context');
        await audioContextRef.current.resume();
      }

      // Only create processor if we don't have one
      if (!processorRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          // Don't capture mic input while AI is speaking (prevents feedback loop)
          if (micPausedForPlaybackRef.current) {
            return;
          }
          
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = float32ToPCM16(inputData);
            const base64Audio = arrayBufferToBase64(pcm16);

            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Audio,
            }));
          }
        };

        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
      }

      setState(prev => ({ ...prev, isListening: true }));
      console.log('🎤 Started listening');
    } catch (error) {
      console.error('Failed to start listening:', error);
      setState(prev => ({ ...prev, error: 'Microphone access denied' }));
      onError?.('Microphone access denied');
    }
  }, [onError]);

  const stopListening = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setState(prev => ({ ...prev, isListening: false }));
    console.log('🔇 Stopped listening');
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text,
            },
          ],
        },
      }));

      wsRef.current.send(JSON.stringify({
        type: 'response.create',
      }));
    }
  }, []);

  const speakDirectly = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('🎯 NEW Coach TTS:', text);
      wsRef.current.send(JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: `Say exactly: "${text}". Use a motivating, coaching tone. Be brief.`
        }
      }));
    }
  }, []);

  const updateContext = useCallback((context: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'session.update_context',
        context,
      }));
    }
  }, []);

  // Helper: decide if an event should trigger AI speech/output
  // DISABLED: NEW coach system handles all responses now via speakDirectly
  const shouldTriggerResponse = useCallback((eventName: string): boolean => {
    return false; // Disable legacy event-triggered responses
  }, []);

  const processQueuedEvent = useCallback(() => {
    if (eventQueueRef.current.length === 0 || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const event = eventQueueRef.current.shift();
    if (!event) return;

    const eventMessage = event.data 
      ? `EVENT: ${event.eventName} ${JSON.stringify(event.data)}`
      : `EVENT: ${event.eventName}`;
    
    console.log('📡 Processing queued event:', eventMessage);
    
    // Send conversation item
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: eventMessage,
          },
        ],
      },
    }));

    // Trigger response
    activeResponseRef.current = true;
    wsRef.current.send(JSON.stringify({
      type: 'response.create',
    }));
  }, []);

  // Main function: send every event for context; trigger speech only for select ones
  const sendEvent = useCallback((eventName: string, data?: any) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const triggerResponse = shouldTriggerResponse(eventName);

    // --- Always send every event (AI needs full context) ---
    const eventMessage = data
      ? `EVENT: ${eventName} ${JSON.stringify(data)}`
      : `EVENT: ${eventName}`;

    console.log(
      triggerResponse
        ? "📡 Sending event to AI (will trigger response):"
        : "📡 Sending event to AI (context only):",
      eventMessage
    );

    // Send structured event message
    wsRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: eventMessage,
            },
          ],
        },
      })
    );

    // --- Only trigger AI speech/output for key events ---
    if (triggerResponse) {
      if (activeResponseRef.current) {
        console.log("🔄 Queuing response-triggering event:", eventName);
        eventQueueRef.current.push({ eventName, data });
        return;
      }

      activeResponseRef.current = true;
      
      // Catastrophic timeout: only fires if OpenAI never sends completion events (12s backup)
      // Normal responses complete via response.audio.done/response.done listeners
      graceTimeoutRef.current = setTimeout(() => {
        if (activeResponseRef.current) {
          console.warn('⚠️ Catastrophic timeout - OpenAI completion events never arrived');
          activeResponseRef.current = false;
          graceTimeoutRef.current = null;
          processQueuedEvent();
        }
      }, 12000); // 12s catastrophic backup - won't interfere with normal responses
      
      wsRef.current.send(
        JSON.stringify({
          type: "response.create",
        })
      );
    }
  }, [shouldTriggerResponse, processQueuedEvent]);

  const waitForAudioDone = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      // If no active response, resolve immediately
      if (!activeResponseRef.current) {
        resolve();
        return;
      }
      
      // Otherwise, register callback to be triggered when audio is done
      audioDoneCallbacksRef.current.push(resolve);
      
      // Safety timeout: 12s to match catastrophic guard (ensures farewell completes)
      setTimeout(() => {
        const index = audioDoneCallbacksRef.current.indexOf(resolve);
        if (index > -1) {
          audioDoneCallbacksRef.current.splice(index, 1);
          console.warn('⚠️ Audio wait timeout after 12s');
          resolve();
        }
      }, 12000);
    });
  }, []);

  const disconnect = useCallback(async (graceful = false) => {
    // If graceful disconnect, wait for any active response to complete
    if (graceful && activeResponseRef.current) {
      console.log('⏳ Waiting for AI response to complete before disconnect...');
      await waitForAudioDone();
    }
    
    stopListening();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Graceful shutdown');
      wsRef.current = null;
    }
    
    // Clear event queue to prevent stale events across sessions
    eventQueueRef.current = [];
    activeResponseRef.current = false;
    
    // Clear grace period timeout
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    
    console.log('🔌 Disconnected from Realtime API');
  }, [stopListening, waitForAudioDone]);

  // ChatGPT: Play one completed PCM clip
  const playPcmResponse = async () => {
    // Ensure AudioContext is ready
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      console.log("🎧 Voice pipeline initialized (PCM16 Float32 path active)");
      runAudioSanityPing(audioContextRef.current);
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    const ctx = audioContextRef.current;

    // Merge all queued chunks into one Float32 buffer
    const totalLength = audioQueueRef.current.reduce((a, b) => a + b.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioQueueRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // ✅ Guard against empty audio and defer reset
    if (!merged || merged.length === 0) {
      console.warn("⚠️ No PCM data to play — skipping playback");
      return;
    }

    isPlayingRef.current = false;

    // Create NEW AudioBufferSourceNode every time (can only start once per node)
    const src = ctx.createBufferSource();
    // OpenAI sends audio at 24kHz - must match exactly to avoid speed/pitch issues
    const buffer = ctx.createBuffer(1, merged.length, 24000);
    buffer.copyToChannel(merged, 0);
    src.buffer = buffer;
    src.connect(ctx.destination);

    setState(prev => ({ ...prev, isSpeaking: true }));
    src.start(0); // can only start once per node
    console.log(`🔊 Playing PCM response (${merged.length} samples)`);

    src.onended = async () => {
      console.log("✅ PCM playback finished");
      // ✅ Now safe to clear the queue
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      setState(prev => ({ ...prev, isSpeaking: false }));
      
      // CRITICAL FIX: Resume audio context after playback (iOS auto-suspends)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log('🔄 Resuming audio context after playback (iOS)');
        try {
          await audioContextRef.current.resume();
        } catch (err) {
          console.error('Failed to resume audio context:', err);
        }
      }
      
      // Trigger any pending audio done callbacks
      audioDoneCallbacksRef.current.forEach(cb => cb());
      audioDoneCallbacksRef.current = [];
      
      // Process next queued event if any
      setTimeout(() => processQueuedEvent(), 100);
      
      // CRITICAL FIX: Never auto-stop mic during workout - keep stream alive
      // Just ensure processor exists (already handled by startListening reuse logic)
      if (!processorRef.current) {
        console.log('🎤 Mic needs restart after AI response...');
        needsRestartRef.current = true;
      } else {
        console.log('🎤 Mic already active, continuing...');
        // No auto-stop timeout - keep mic alive for entire workout
      }
    };
  };

  const cleanup = () => {
    stopListening();
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    
    // Clear auto-stop timeout on cleanup
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
  };

  // Effect to restart microphone after AI finishes speaking (if it was stopped)
  useEffect(() => {
    if (needsRestartRef.current && state.isConnected && !state.isListening && !state.isSpeaking) {
      console.log('🎤 Auto-restarting microphone after AI response...');
      needsRestartRef.current = false;
      startListening();
    }
  }, [state.isConnected, state.isListening, state.isSpeaking, startListening]);

  useEffect(() => {
    return () => {
      cleanup();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    waitForAudioDone,
    startListening,
    stopListening,
    sendText,
    sendEvent,
    updateContext,
    speakDirectly,
  };
}

function float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}
