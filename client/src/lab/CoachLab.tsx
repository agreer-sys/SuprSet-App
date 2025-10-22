import { useMemo, useRef, useState, useCallback } from 'react';
import { seedResponses } from '@/coach/responseService';
import { onEvent } from '@/coach/observer';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';
import { Mic, MicOff } from 'lucide-react';

const EXERCISES = [
  { id:'ex-1', name:'Bicep Curl', cues:['Elbows pinned at sides','Control the descent','Full lockout without swing','Neutral wrist'] },
  { id:'ex-2', name:'Release Push-Up', cues:['Brace the trunk','Elbows ~45°','Pack the shoulders','Exhale on press'] },
];

function useCtx(
  chatter: ChatterLevel, 
  speakFn: (text: string) => void,
  beepFn: (kind: string) => void
): TimelineContext {
  return useMemo(()=>({
    workoutId: 'lab',
    pattern: 'straight_sets',
    mode: 'reps',
    chatterLevel: chatter,
    prefs: { preflightLoadIntake: true, strictEMOM: true, allowAutoExtendRest: false, rpeLabels: 'words' },
    plannedLoads: {},
    nowMs: ()=>Date.now(),
    getExerciseName: (id) => EXERCISES.find(e=>e.id===id)?.name ?? 'Exercise',
    getNextExerciseName: () => undefined,
    getExerciseMeta: (id) => {
      const e = EXERCISES.find(x=>x.id===id);
      return e ? { id:e.id, name:e.name, cues:e.cues } : { id, name:'Exercise' };
    },
    speak: speakFn,
    caption: (t)=>console.log('[CAPTION]', t),
    beep: beepFn,
    haptic: ()=>{}
  }), [chatter, speakFn, beepFn]);
}

export default function CoachLab(){
  const [chatter, setChatter] = useState<ChatterLevel>('minimal');
  
  // Controls
  const [restSec, setRestSec] = useState(30);
  const [workSec, setWorkSec] = useState(30);
  const [previewLeadAuto, setPreviewLeadAuto] = useState(true);
  const [previewLead, setPreviewLead] = useState(10);
  const [sets, setSets] = useState(3);
  const [exerciseId, setExerciseId] = useState('ex-1');

  const runningRef = useRef(false);
  const timeouts = useRef<number[]>([]);

  // Audio context for beeps
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  // Voice system
  const handleTranscript = useCallback((transcript: string, isFinal: boolean) => {
    console.log('[TRANSCRIPT]', transcript, isFinal ? '(final)' : '');
  }, []);

  const handleError = useCallback((error: string) => {
    console.error('[VOICE ERROR]', error);
  }, []);

  const realtime = useRealtimeVoice({
    sessionId: 999, // Lab session ID
    onTranscript: handleTranscript,
    onError: handleError,
  });

  // Beep functions
  const playBeep = useCallback((kind: string) => {
    try {
      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Different beeps for different events
      if (kind === 'countdown') {
        oscillator.frequency.value = 440; // A note
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
      } else if (kind === 'start') {
        oscillator.frequency.value = 523; // C note
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        oscillator.start(now);
        oscillator.stop(now + 1.0);
      } else if (kind === 'end') {
        oscillator.frequency.value = 392; // G note
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        oscillator.start(now);
        oscillator.stop(now + 0.8);
      } else if (kind === 'last5') {
        oscillator.frequency.value = 330; // E note
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
      }
      console.log('[BEEP]', kind);
    } catch (error) {
      console.error('Beep error:', error);
    }
  }, []);

  // Speak function
  const speak = useCallback((text: string) => {
    console.log('[COACH]', text);
    realtime.speakDirectly(text);
  }, [realtime]);

  const ctx = useCtx(chatter, speak, playBeep);

  function clearAll(){
    timeouts.current.forEach(id=>clearTimeout(id));
    timeouts.current = [];
    runningRef.current = false;
  }

  function schedule(ms:number, fn:()=>void){
    const id = window.setTimeout(fn, ms);
    timeouts.current.push(id);
  }

  function computePreviewLead(rs:number){
    if (!previewLeadAuto) return previewLead;
    if (rs >= 45) return 15;
    if (rs >= 20) return 10;
    return -1; // skip
  }

  function emit(ev: Event){
    onEvent(ctx, ev);
  }

  function playOneSet(setIndex:number){
    const lead = computePreviewLead(restSec);
    const name = ctx.getExerciseName(exerciseId);

    // REST window before the set
    emit({ type:'EV_REST_START', sec: restSec });

    // PREVIEW near end of rest (if applicable)
    if (lead > 0 && lead < restSec){
      schedule((restSec - lead) * 1000, () => {
        emit({ type:'EV_WORK_PREVIEW', exerciseId, setIndex, totalSets: sets });
      });
    }

    // Countdown beeps (3-2-1 right before start)
    const countdownAt = 3; // seconds
    if (restSec >= countdownAt){
      schedule((restSec - 2) * 1000, () => ctx.beep?.('countdown'));
      schedule((restSec - 1) * 1000, () => ctx.beep?.('countdown'));
      schedule((restSec - 0) * 1000, () => ctx.beep?.('start'));
    }

    // WORK start right after beeps
    schedule(restSec * 1000 + 200, () => {
      emit({ type:'EV_WORK_START', exerciseId, setIndex, totalSets: sets });
    });

    // LAST 5s cue (if long enough work)
    if (workSec >= 7){
      schedule((restSec + workSec - 5) * 1000, () => {
        // In the main app you can emit a dedicated 'last5s' event; here we re-use countdown for pool testing.
        // Or, if you add an explicit Event type, map it in responseService.
        // For now, we'll just caption & beep:
        ctx.beep?.('last5');
        console.log('[LAB] last5s cue window');
      });
    }

    // WORK end + rest end (for this one-set demo)
    schedule((restSec + workSec) * 1000, () => {
      ctx.beep?.('end');
      emit({ type:'EV_WORK_END', exerciseId });
      emit({ type:'EV_REST_END' });
      console.log(`[LAB] Completed ${name} set ${setIndex+1}/${sets}`);
    });
  }

  async function play(){
    if (runningRef.current) return;
    runningRef.current = true;

    // Initialize audio context
    const audioContext = getAudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    console.clear();
    console.log('[LAB] Starting scenario…');

    // Seed preview/start pools so you hear the split immediately
    seedResponses([
      // PREVIEW (name + set)
      { id:101,event_type:'work_preview',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Set {{setNum}} — {{exercise}} coming up.',priority:5,cooldown_sec:6,active:true,usage_count:0,last_used_at:null },
      { id:102,event_type:'work_preview',pattern:'any',mode:'time',chatter_level:'minimal',locale:'en-US',text_template:'Round {{roundNum}} — {{exercise}} next.',priority:5,cooldown_sec:6,active:true,usage_count:0,last_used_at:null },
      // START (cue only)
      { id:111,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Go — {{cue}}.',priority:5,cooldown_sec:4,active:true,usage_count:0,last_used_at:null },
      { id:112,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Move — {{cue}}.',priority:4,cooldown_sec:4,active:true,usage_count:0,last_used_at:null },
      // LAST5S (tempo cue only) — demo prints/beeps, see code above
    ] as any);

    emit({ type:'EV_BLOCK_START', blockId:'demo' });

    for (let s=0; s<sets; s++){
      const offset = s * (restSec + workSec) * 1000;
      schedule(offset, () => playOneSet(s));
    }

    // End the block after all sets
    schedule(sets * (restSec + workSec) * 1000 + 400, () => {
      emit({ type:'EV_BLOCK_END', blockId:'demo' });
      runningRef.current = false;
    });
  }

  return (
    <div className="p-4">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Coach Lab — Preview/Start Split</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <label className="text-sm">Exercise</label>
              <Select value={exerciseId} onValueChange={setExerciseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXERCISES.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm">Sets</label>
              <Input inputMode="numeric" value={sets} onChange={e=>setSets(Number(e.target.value||1))} />
            </div>
            <div className="col-span-2">
              <label className="text-sm">Rest (s)</label>
              <Input inputMode="numeric" value={restSec} onChange={e=>setRestSec(Number(e.target.value||0))} />
            </div>
            <div className="col-span-2">
              <label className="text-sm">Work (s)</label>
              <Input inputMode="numeric" value={workSec} onChange={e=>setWorkSec(Number(e.target.value||0))} />
            </div>
            <div className="col-span-2">
              <label className="text-sm">Chatter</label>
              <Select value={chatter} onValueChange={(v)=>setChatter(v as ChatterLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['silent','signals','minimal','standard','high'] as const).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-3">
              <label className="text-sm">Preview Lead</label>
              <Select value={previewLeadAuto ? 'auto' : 'custom'} onValueChange={v=>setPreviewLeadAuto(v==='auto')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (15s/10s/skip)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!previewLeadAuto && (
              <div className="col-span-3">
                <label className="text-sm">Lead (s)</label>
                <Input inputMode="numeric" value={previewLead} onChange={e=>setPreviewLead(Number(e.target.value||0))} />
              </div>
            )}
          </div>

          <div className="flex gap-2 items-center">
            {!realtime.isConnected ? (
              <Button onClick={() => realtime.connect()} variant="default">
                <Mic className="w-4 h-4 mr-2" />
                Connect Voice
              </Button>
            ) : (
              <Button onClick={() => realtime.disconnect()} variant="outline">
                <MicOff className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            )}
            <Button onClick={play} disabled={!realtime.isConnected}>▶️ Play Scenario</Button>
            <Button variant="outline" onClick={clearAll}>⏹ Stop/Clear</Button>
            {realtime.isConnected && (
              <Badge variant="outline" className="ml-auto">
                {realtime.isSpeaking ? '🔊 Speaking' : '✅ Connected'}
              </Badge>
            )}
          </div>

          <div className="text-xs text-muted-foreground pt-2">
            1. Click "Connect Voice" to enable microphone and AI coach<br />
            2. Watch the console for [COACH], [CAPTION], and [BEEP] lines<br />
            3. Listen for beeps and voice coaching during the scenario
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
