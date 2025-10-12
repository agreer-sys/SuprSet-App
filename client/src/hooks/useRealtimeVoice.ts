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

        // Reset audio queue on new response to fix multi-response playback
        if (message.type === 'response.created') {
          audioQueueRef.current = [];
          isPlayingRef.current = false;
          console.log('🎬 New response started, reset audio queue');
        }

        if (message.type === 'response.audio.delta' && message.delta) {
          const audioData = base64ToFloat32Array(message.delta);
          audioQueueRef.current.push(audioData);
          
          if (!isPlayingRef.current) {
            playAudioQueue();
          }
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

        if (message.type === 'response.audio.done') {
          setState(prev => ({ ...prev, isSpeaking: false }));
          console.log('✅ Response audio done, clearing active flag');
          
          // Only process if not already handled by response.done
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

        // Process queue on response.done as well (OpenAI doesn't always send response.audio.done)
        if (message.type === 'response.done' || message.type === 'response.completed') {
          console.log(`✅ Response ${message.type}, clearing active flag`);
          
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
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
      processor.connect(audioContext.destination);

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

  const updateContext = useCallback((context: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'session.update_context',
        context,
      }));
    }
  }, []);

  // Helper: decide if an event should trigger AI speech/output
  const shouldTriggerResponse = useCallback((eventName: string): boolean => {
    const TRIGGER_EVENTS = [
      "await_ready",        // announce exercise enthusiastically ("Let's go... burpees set 1")
      "set_midpoint",       // midpoint encouragement ("Halfway there, finish strong")
      "set_complete",       // ask weight/reps
      "block_transition",   // announce next block
      "workout_complete"    // session end
      // REMOVED: set_start (exercise already announced at await_ready)
      // REMOVED: set_10s_remaining (stay silent to save energy for set completion)
      // REMOVED: user_ready (avoid redundant speech)
      // REMOVED: rest_start (context-only)
    ];

    return TRIGGER_EVENTS.includes(eventName);
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

  const playAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
    micPausedForPlaybackRef.current = true; // Pause mic to prevent feedback
    setState(prev => ({ ...prev, isSpeaking: true }));

    const audioContext = new AudioContext({ sampleRate: 24000 });

    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift();
      if (!audioData) continue;

      const audioBuffer = audioContext.createBuffer(1, audioData.length, 24000);
      audioBuffer.getChannelData(0).set(audioData);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    }

    await audioContext.close();
    isPlayingRef.current = false;
    
    // Add 500ms delay before resuming mic (allow for audio settling)
    await new Promise(resolve => setTimeout(resolve, 500));
    micPausedForPlaybackRef.current = false; // Resume mic after AI finishes
    
    setState(prev => ({ ...prev, isSpeaking: false }));
    
    // Continuous conversation: Check if mic needs restart or if it's already open
    if (!processorRef.current) {
      // Mic was stopped (e.g., during pause) - signal that we need to restart it
      console.log('🎤 Mic needs restart after AI response...');
      needsRestartRef.current = true;
    } else {
      console.log('🎤 Auto-resuming mic for follow-up conversation (8s window)...');
      
      // Clear any existing timeout
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
      
      // Auto-stop mic after 8 seconds of continuous conversation window
      autoStopTimeoutRef.current = setTimeout(() => {
        if (processorRef.current && !isPlayingRef.current) {
          console.log('⏱️ Auto-stopping mic after conversation timeout');
          stopListening();
        }
      }, 8000);
    }
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
