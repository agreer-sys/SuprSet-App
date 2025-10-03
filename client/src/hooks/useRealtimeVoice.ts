import { useEffect, useRef, useState, useCallback } from 'react';

interface RealtimeConfig {
  sessionId: number;
  onFunctionCall?: (functionName: string, args: any) => void;
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
  onFunctionCall,
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

        if (message.type === 'function_call') {
          console.log('🔧 Function call:', message.function, message.arguments);
          onFunctionCall?.(message.function, message.arguments);
        }

        if (message.type === 'input_audio_buffer.speech_started') {
          setState(prev => ({ ...prev, isListening: true }));
        }

        if (message.type === 'input_audio_buffer.speech_stopped') {
          setState(prev => ({ ...prev, isListening: false }));
        }

        if (message.type === 'response.audio.done') {
          setState(prev => ({ ...prev, isSpeaking: false }));
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
  }, [sessionId, onFunctionCall, onTranscript, onError]);

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

  const disconnect = useCallback(() => {
    stopListening();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopListening]);

  const playAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
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
    setState(prev => ({ ...prev, isSpeaking: false }));
  };

  const cleanup = () => {
    stopListening();
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

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
    startListening,
    stopListening,
    sendText,
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
