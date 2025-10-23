import React, { useMemo, useRef, useState } from 'react';
import { seedResponses } from '@/coach/responseService';
import { onEvent } from '@/coach/observer';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';

const EXERCISES = [
  { id:'ex-1', name:'Bicep Curl', cues:[
    'elbows pinned at sides',
    'control the descent',
    'no swing — brace the trunk',
    'full lockout, smooth return'
  ]},
  { id:'ex-2', name:'Release Push-Up', cues:[
    'pack the shoulders',
    'exhale on press',
    'elbows ~45° off ribs',
    'brace — keep the line'
  ]},
];

function useCtx(chatter: ChatterLevel, sets: number): TimelineContext {
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
      return e ? { id:e.id, name:e.name, cues:e.cues } : { id, name:'Exercise', cues:[] };
    },
    
    // Personalization + block summary for intros
    user: { firstName: 'Alastair' },
    blockMeta: {
      pattern: 'straight_sets',
      mode: 'reps',
      setsPerExercise: sets,
      exerciseCount: EXERCISES.length,
      patternLabel: undefined,
      guideRoundSec: 180,
    },
    
    speak: (t)=>console.log('%c[COACH]', 'color:#7c4dff', t),
    caption: (t)=>console.log('%c[CAPTION]', 'color:#607d8b', t),
    beep: (kind)=>console.log('%c[BEEP]', 'color:#009688', kind),
    haptic: ()=>{}
  }), [chatter, sets]);
}

export default function CoachLab(){
  const [chatter, setChatter] = useState<ChatterLevel>('minimal');
  const [exerciseId, setExerciseId] = useState('ex-1');

  // timings
  const [restSec, setRestSec] = useState(30);
  const [workSec, setWorkSec] = useState(30);
  const [sets, setSets] = useState(3);

  // preview lead policy
  const [autoLead, setAutoLead] = useState(true);
  const [customLead, setCustomLead] = useState(10);

  const ctx = useCtx(chatter, sets);
  const runningRef = useRef(false);
  const tos = useRef<number[]>([]);

  function clearAll(){
    tos.current.forEach(id=>clearTimeout(id));
    tos.current = [];
    runningRef.current = false;
    console.log('[LAB] cleared');
  }
  function schedule(ms:number, fn:()=>void){ const id = window.setTimeout(fn, ms); tos.current.push(id); }
  function previewLead(rs:number){
    if (!autoLead) return customLead;
    if (rs >= 45) return 15;
    if (rs >= 20) return 10;
    return -1; // skip preview
  }
  function emit(ev: Event){ onEvent(ctx, ev); }

  function playOneSet(si:number){
    const lead = previewLead(restSec);

    // REST window starts now
    emit({ type:'EV_REST_START', sec: restSec });

    // PREVIEW near end of rest
    if (lead > 0 && lead < restSec){
      schedule((restSec - lead) * 1000, () => {
        emit({ type:'EV_WORK_PREVIEW', exerciseId, setIndex: si, totalSets: sets });
      });
    }

    // countdown beeps
    if (restSec >= 3){
      schedule((restSec - 2) * 1000, ()=>ctx.beep?.('countdown'));
      schedule((restSec - 1) * 1000, ()=>ctx.beep?.('countdown'));
      schedule((restSec - 0) * 1000, ()=>ctx.beep?.('start'));
    }

    // WORK start (slight delay after GO beep)
    schedule(restSec * 1000 + 200, () => {
      emit({ type:'EV_WORK_START', exerciseId });
    });

    // LAST 5s beep demo
    if (workSec >= 7){
      schedule((restSec + workSec - 5) * 1000, ()=>ctx.beep?.('last5'));
    }

    // WORK end → REST end
    schedule((restSec + workSec) * 1000, () => {
      ctx.beep?.('end');
      emit({ type:'EV_WORK_END', exerciseId });
      emit({ type:'EV_REST_END' });
    });
  }

  function play(){
    if (runningRef.current) return;
    runningRef.current = true;

    console.clear();
    console.log('[LAB] Coach Lab starting…');

    // seed preview/start split
    seedResponses([
      // PREVIEW (name + set/round)
      { id:101,event_type:'work_preview',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Set {{setNum}} — {{exercise}} coming up.',priority:5,cooldown_sec:6,active:true,usage_count:0,last_used_at:null },
      { id:102,event_type:'work_preview',pattern:'any',mode:'time',chatter_level:'minimal',locale:'en-US',text_template:'Round {{roundNum}} — {{exercise}} next.',priority:5,cooldown_sec:6,active:true,usage_count:0,last_used_at:null },
      // START (cue only) — if pool misses, observer will synthesize with DB cues
      { id:111,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Go — {{cue}}.',priority:5,cooldown_sec:4,active:true,usage_count:0,last_used_at:null },
      { id:112,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Move — {{cue}}.',priority:4,cooldown_sec:4,active:true,usage_count:0,last_used_at:null },
    ] as any);

    // quick pre-block orientation (optional)
    emit({ type:'EV_BLOCK_START', blockId:'demo' });

    for (let s=0; s<sets; s++){
      const offset = s * (restSec + workSec) * 1000;
      schedule(offset, () => playOneSet(s));
    }

    // end marker
    schedule(sets * (restSec + workSec) * 1000 + 400, () => {
      emit({ type:'EV_BLOCK_END', blockId:'demo' });
      runningRef.current = false;
      console.log('[LAB] done');
    });
  }

  const ex = EXERCISES.find(e=>e.id===exerciseId)!;

  return (
    <div style={{padding:16, maxWidth:820}}>
      <h2 style={{fontWeight:700, fontSize:18, marginBottom:8}}>Coach Lab — Preview/Start Split</h2>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
        <label>Exercise
          <select value={exerciseId} onChange={e=>setExerciseId(e.target.value)} style={{display:'block', width:'100%'}}>
            {EXERCISES.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label>Sets
          <input type="number" value={sets} onChange={e=>setSets(Number(e.target.value||1))} style={{display:'block', width:'100%'}} />
        </label>
        <label>Chatter
          <select value={chatter} onChange={e=>setChatter(e.target.value as ChatterLevel)} style={{display:'block', width:'100%'}}>
            {['silent','minimal','high'].map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
        <label>Rest (s)
          <input type="number" value={restSec} onChange={e=>setRestSec(Number(e.target.value||0))} style={{display:'block', width:'100%'}} />
        </label>
        <label>Work (s)
          <input type="number" value={workSec} onChange={e=>setWorkSec(Number(e.target.value||0))} style={{display:'block', width:'100%'}} />
        </label>
        <label>Preview Lead
          <select value={autoLead ? 'auto':'custom'} onChange={e=>setAutoLead(e.target.value==='auto')} style={{display:'block', width:'100%'}}>
            <option value="auto">Auto (15s/10s/skip&lt;20s)</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>

      {!autoLead && (
        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:12, marginBottom:12}}>
          <label>Custom Lead (s)
            <input type="number" value={customLead} onChange={e=>setCustomLead(Number(e.target.value||0))} style={{display:'block', width:'100%'}} />
          </label>
        </div>
      )}

      <div style={{display:'flex', gap:8, marginBottom:8}}>
        <button onClick={play}>▶️ Play Scenario</button>
        <button onClick={clearAll}>⏹ Stop/Clear</button>
      </div>

      <div style={{fontSize:12, color:'#666', marginTop:8}}>
        <div><b>Preview</b>: name + set (during rest near the end). <b>Start</b>: cue-only (picked from exercise cues).</div>
        <div>Watch the console for <code>[COACH]</code>, <code>[CAPTION]</code>, and <code>[BEEP]</code> logs.</div>
        <div>Tip: set Rest=15s to see preview skip; Rest=30s shows preview at T–10s.</div>
        <hr style={{margin:'12px 0'}}/>
        <div><b>{ex.name} cues:</b> {ex.cues.join(' · ')}</div>
      </div>
    </div>
  );
}
