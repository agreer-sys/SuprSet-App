import React, { useMemo, useRef, useState } from 'react';
import { onEvent } from '@/coach/observer';
import { seedResponses } from '@/coach/responseService';
import { scheduleA2TechnicalCue } from '@/coach/a2CueScheduler';
import { PaceModel } from '@/coach/paceModel';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';

type Ex = { id:string; name:string; estimatedTimeSec:number; unilateral?:boolean; cues:string[] };

const EXS: Ex[] = [
  { id:'ex-1', name:'Barbell Chest Press', estimatedTimeSec:45, cues:[
    'set the shoulders—pinch and pack',
    'touch chest, drive straight up',
    'brace—no hips off bench',
    'smooth descent—control the bar'
  ]},
  { id:'ex-2', name:'Curtsy Lunges', estimatedTimeSec:75, unilateral:true, cues:[
    'knee tracks over mid-foot',
    'stay tall—hips square',
    'soft touch—drive through front heel',
    'control the balance—no collapse'
  ]},
  { id:'ex-3', name:'Roll Ups', estimatedTimeSec:30, cues:[
    'segment the spine—slow roll',
    'reach long—exhale on the curl',
    'ribs down—brace',
    'smooth tempo—no yank'
  ]},
];

function playBeep(kind: 'countdown' | 'start' | 'last5' | 'end') {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  if (kind === 'countdown') {
    osc.frequency.value = 440; // A4
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (kind === 'start') {
    osc.frequency.value = 880; // A5 (higher pitch for GO)
    gain.gain.value = 0.4;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } else if (kind === 'last5') {
    osc.frequency.value = 523; // C5
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } else if (kind === 'end') {
    osc.frequency.value = 220; // A3 (lower for end)
    gain.gain.value = 0.4;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

function useCtx(chatter: ChatterLevel): TimelineContext {
  return useMemo(()=>({
    workoutId: 'lab-rep',
    pattern: 'superset',
    mode: 'reps',
    chatterLevel: chatter,
    prefs: { preflightLoadIntake: true, strictEMOM: true, allowAutoExtendRest: false, rpeLabels: 'words' },
    plannedLoads: {},
    nowMs: ()=>Date.now(),
    getExerciseName: (id) => EXS.find(e=>e.id===id)?.name ?? 'Exercise',
    getNextExerciseName: () => undefined,
    getExerciseMeta: (id) => {
      const e = EXS.find(x=>x.id===id);
      return e ? { id:e.id, name:e.name, cues:e.cues, estimatedTimeSec:e.estimatedTimeSec, unilateral: !!e.unilateral } : { id, name:'Exercise' };
    },
    speak: (t)=>window.speechSynthesis?.speak(Object.assign(new SpeechSynthesisUtterance(t),{rate:1,pitch:1,lang:'en-US'})),
    caption: (t)=>console.log('%c[CAPTION]', 'color:#607d8b', t),
    beep: (kind)=>{ console.log('%c[BEEP]', 'color:#009688', kind); playBeep(kind); },
    haptic: ()=>{}
  }), [chatter]);
}

// Compute pacing windows for a 3:00 round given estimatedTimeSec and unilateral weighting
function computeWindows(exs: Ex[], roundSec:number){
  const weighted = exs.map(e => ({ ...e, w: e.estimatedTimeSec * (e.unilateral ? 2 : 1) }));
  const totalW = weighted.reduce((s,e)=>s+e.w,0);
  return weighted.map(e => ({
    id: e.id,
    name: e.name,
    cues: e.cues,
    start: 0, // will fill cumulatively
    dur: Math.max(15, Math.round(roundSec * (e.w/totalW))) // floor to ≥15s
  })).map((w,i,arr)=>{
    w.start = arr.slice(0,i).reduce((s,x)=>s+x.dur,0);
    return w;
  });
}

export default function CoachLabRepRound(){
  const [chatter, setChatter] = useState<ChatterLevel>('minimal');
  const [roundSec, setRoundSec] = useState(180); // 3:00 per round
  const [rounds, setRounds] = useState(4);

  const ctx = useCtx(chatter);
  const tos = useRef<number[]>([]);
  const running = useRef(false);

  function clearAll(){ tos.current.forEach(clearTimeout); tos.current=[]; running.current=false; console.log('[LAB] cleared'); }
  function schedule(ms:number, fn:()=>void){ const id=window.setTimeout(fn, ms); tos.current.push(id); }
  function emit(ev: Event){ onEvent(ctx, ev); }

  function playRound(roundIndex:number){
    const roundStartMs = Date.now();

    // Preview near T-10s (list A1..A3)
    schedule(Math.max(0, 1000), () => {
      const first = EXS[0];
      emit({ type:'EV_WORK_PREVIEW', exerciseId:first.id, roundIndex, totalRounds: rounds });
    });

    // 3-2-1 beeps then GO
    schedule(0, ()=>ctx.beep?.('countdown'));
    schedule(1000, ()=>ctx.beep?.('countdown'));
    schedule(2000, ()=>ctx.beep?.('start'));

    // Start cue (A1) shortly after GO
    schedule(2200, () => {
      emit({ type:'EV_WORK_START', exerciseId: EXS[0].id });
    });

    // Minute pips (generic anchors)
    if (roundSec >= 60) schedule(60*1000, () => emit({ type:'EV_COUNTDOWN', sec:60 }));
    if (roundSec >= 120) schedule(120*1000, () => emit({ type:'EV_COUNTDOWN', sec:120 }));

    // High-only halfway motivation
    if (ctx.chatterLevel === 'high' && roundSec >= 40) {
      schedule(Math.floor(roundSec*500), () => emit({ type:'EV_HALFWAY' }));
    }

    // A2 technical cue (High only, rounds 2+), with confidence gate + collision guards
    const cancelA2 = scheduleA2TechnicalCue({
      ctx,
      roundStartMs,
      roundSec,
      roundIndex,
      exercises: EXS.map(e => ({ id: e.id })),
      emit: (ev) => emit(ev)
    });

    // Last-10s beeps and end
    if (roundSec >= 12) schedule((roundSec - 10)*1000, ()=>ctx.beep?.('last5')); // label reused for last-10 tone in lab
    schedule(roundSec*1000, ()=>ctx.beep?.('end'));
    schedule(roundSec*1000, ()=>emit({ type:'EV_ROUND_REST_START', sec:0 }));
    schedule(roundSec*1000, ()=>console.log(`[LAB] Round ${roundIndex+1}/${rounds} done`));

    // expose a manual "Round done" tap in lab to test cancel
    (window as any).labRoundDone = () => cancelA2();
  }

  function play(){
    if (running.current) return;
    running.current = true;
    console.clear();
    console.log('[LAB-REP] starting…');

    // Seed pools for preview/start/halfway
    seedResponses([
      { id:201,event_type:'work_preview',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Round {{roundNum}} — {{exercise}} next.',priority:5,cooldown_sec:4,active:true,usage_count:0,last_used_at:null },
      { id:211,event_type:'work_start',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Go — {{cue}}.',priority:5,cooldown_sec:4,active:true,usage_count:0,last_used_at:null },
      { id:221,event_type:'halfway',pattern:'any',mode:'reps',chatter_level:'high',locale:'en-US',text_template:'Halfway — keep it smooth.',priority:5,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
    ] as any);

    emit({ type:'EV_BLOCK_START', blockId:'rep-round' });

    for (let r=0; r<rounds; r++){
      const offset = r * roundSec * 1000;
      setTimeout(()=> playRound(r), offset);
    }

    setTimeout(()=>{
      emit({ type:'EV_BLOCK_END', blockId:'rep-round' });
      running.current = false;
      console.log('[LAB-REP] complete.');
    }, rounds * roundSec * 1000 + 300);
  }

  return (
    <div style={{padding:16, maxWidth:820}}>
      <h2 style={{fontWeight:700, fontSize:18, marginBottom:8}}>Coach Lab — Rep Round (3:00 style)</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
        <label>Chatter
          <select value={chatter} onChange={e=>setChatter(e.target.value as ChatterLevel)} style={{display:'block', width:'100%'}}>
            {['silent','minimal','high'].map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>Round length (s)
          <input type="number" value={roundSec} onChange={e=>setRoundSec(Number(e.target.value||180))} style={{display:'block', width:'100%'}} />
        </label>
        <label>Rounds
          <input type="number" value={rounds} onChange={e=>setRounds(Number(e.target.value||4))} style={{display:'block', width:'100%'}} />
        </label>
      </div>

      <div style={{marginBottom:8}}>
        <b>Exercises & estimated windows</b>
        <ul style={{margin:'6px 0 12px 16px'}}>
          {EXS.map(x => <li key={x.id}>{x.name} — est {x.estimatedTimeSec}s{ x.unilateral ? ' (unilateral)' : ''}</li>)}
        </ul>
        <small style={{color:'#666'}}>Unilateral movements count ~2× in pacing; windows are normalized to fill the 3:00 round.</small>
      </div>

      <div style={{display:'flex', gap:8, marginBottom:8}}>
        <button onClick={play}>▶️ Play Rep Round</button>
        <button onClick={clearAll}>⏹ Stop/Clear</button>
      </div>

      <div style={{fontSize:12, color:'#666', marginTop:8}}>
        <div><b>Free pace</b> — no hard windows. Preview A1 → 3-2-1-GO → minute pips → halfway (High) → A2 tech hint (High, R2+, ≥70% conf) → last-10s beeps.</div>
        <div style={{marginTop:4}}>A2 cue fires only if: <b>High chatter</b>, <b>Round 2+</b>, <b>confidence ≥70%</b>, and <b>A2 window ≥25s</b>. Avoids beep collisions.</div>
        <div style={{marginTop:4}}>Test early finish: open console → <code>labRoundDone()</code> (cancels A2 cue).</div>
      </div>
    </div>
  );
}
