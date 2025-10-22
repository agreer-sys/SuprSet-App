import { useMemo, useRef, useState } from 'react';
import { seedResponses } from '@/coach/responseService';
import { onEvent } from '@/coach/observer';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EXERCISES = [
  { id:'ex-1', name:'Bicep Curl', cues:['Elbows pinned at sides','Control the descent','Full lockout without swing','Neutral wrist'] },
  { id:'ex-2', name:'Release Push-Up', cues:['Brace the trunk','Elbows ~45°','Pack the shoulders','Exhale on press'] },
];

function useCtx(chatter: ChatterLevel): TimelineContext {
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
    speak: (t)=>console.log('[COACH]', t),
    caption: (t)=>console.log('[CAPTION]', t),
    beep: (kind)=>console.log('[BEEP]', kind),
    haptic: ()=>{}
  }), [chatter]);
}

export default function CoachLab(){
  const [chatter, setChatter] = useState<ChatterLevel>('minimal');
  const ctx = useCtx(chatter);

  // Controls
  const [restSec, setRestSec] = useState(30);
  const [workSec, setWorkSec] = useState(30);
  const [previewLeadAuto, setPreviewLeadAuto] = useState(true);
  const [previewLead, setPreviewLead] = useState(10);
  const [sets, setSets] = useState(3);
  const [exerciseId, setExerciseId] = useState('ex-1');

  const runningRef = useRef(false);
  const timeouts = useRef<number[]>([]);

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

  function play(){
    if (runningRef.current) return;
    runningRef.current = true;

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

          <div className="flex gap-2">
            <Button onClick={play}>▶️ Play Scenario</Button>
            <Button variant="outline" onClick={clearAll}>⏹ Stop/Clear</Button>
          </div>

          <div className="text-xs text-muted-foreground pt-2">
            Watch the console for [COACH], [CAPTION], and [BEEP] lines. Adjust rest/work and preview lead to hear cadence changes.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
