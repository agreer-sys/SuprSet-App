import React, { useRef } from 'react';
import { beeps } from '@/coach/beeps';

function scheduleRepRoundBeeps(roundSec = 180, minutePips = true){
  const items: Array<{ atMs:number; kind: 'countdown'|'start'|'last5'|'end'|'confirm' }> = [
    { atMs:    0, kind: 'countdown' },
    { atMs: 1000, kind: 'countdown' },
    { atMs: 2000, kind: 'start' },
  ];
  if (minutePips && roundSec >= 60) items.push({ atMs: 60_000, kind: 'countdown' });
  if (minutePips && roundSec >= 120) items.push({ atMs: 120_000, kind: 'countdown' });
  if (roundSec >= 12) items.push({ atMs: (roundSec-10)*1000, kind: 'last5' });
  items.push({ atMs: roundSec*1000, kind: 'end' });
  return beeps.sequence(items);
}

function scheduleTimeBlockBeeps(workSec:number, restSec:number){
  beeps.sequence([
    { atMs: (restSec-2)*1000, kind: 'countdown' },
    { atMs: (restSec-1)*1000, kind: 'countdown' },
    { atMs: (restSec-0)*1000, kind: 'start' },
  ]);
  if (workSec >= 7) beeps.sequence([{ atMs: (restSec + workSec - 5)*1000, kind: 'last5' }]);
  beeps.sequence([{ atMs: (restSec + workSec)*1000, kind: 'end' }]);
}

export default function BeepHarness(){
  const cancelRef = useRef<null | (()=>void)>(null);
  
  return (
    <div style={{ padding: 16, maxWidth: 820 }}>
      <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Beep Harness</h2>
      
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Individual Beeps</h3>
        <div style={{ display:'flex', gap:8, flexWrap: 'wrap' }}>
          <button onClick={()=> beeps.play('countdown')}>Short Pip (countdown)</button>
          <button onClick={()=> beeps.play('start')}>Long Beep (GO)</button>
          <button onClick={()=> beeps.play('last5')}>Short Pip (last-5)</button>
          <button onClick={()=> beeps.play('end')}>Long Beep (end)</button>
          <button onClick={()=> beeps.play('confirm')}>Confirm Chirp</button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Rep-Round Sequences</h3>
        <div style={{ display:'flex', gap:8, flexWrap: 'wrap' }}>
          <button onClick={()=> { 
            cancelRef.current?.(); 
            cancelRef.current = scheduleRepRoundBeeps(180, true); 
          }}>▶ 3:00 Rep-Round (with minute pips)</button>
          <button onClick={()=> { 
            cancelRef.current?.(); 
            cancelRef.current = scheduleRepRoundBeeps(150, false); 
          }}>▶ 2:30 Rep-Round (no pips)</button>
          <button onClick={()=> { 
            cancelRef.current?.(); 
            cancelRef.current = scheduleRepRoundBeeps(60, false); 
          }}>▶ 1:00 Rep-Round</button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Time-Block Sequences</h3>
        <div style={{ display:'flex', gap:8, flexWrap: 'wrap' }}>
          <button onClick={()=> {
            cancelRef.current?.();
            const work=30, rest=30;
            let t=0; 
            for(let i=0;i<3;i++){
              setTimeout(()=>scheduleTimeBlockBeeps(work, rest), t);
              t += (rest+work)*1000;
            }
            cancelRef.current = () => {};
          }}>▶ 30/30 ×3 sets</button>
          <button onClick={()=> {
            cancelRef.current?.();
            const work=20, rest=10;
            let t=0; 
            for(let i=0;i<8;i++){
              setTimeout(()=>scheduleTimeBlockBeeps(work, rest), t);
              t += (rest+work)*1000;
            }
            cancelRef.current = () => {};
          }}>▶ 20/10 ×8 (Tabata)</button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={()=> { cancelRef.current?.(); }} style={{ background: '#e53e3e', color: 'white' }}>
          ⏹ Stop All
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <div><b>Beep Specs (v1.0):</b></div>
        <ul style={{ margin: '8px 0 0 16px', lineHeight: 1.6 }}>
          <li><b>SHORT PIP</b>: 220ms @ 880Hz (countdown, last-5/10)</li>
          <li><b>LONG BEEP</b>: 600ms @ 660Hz (start, end)</li>
          <li><b>CONFIRM CHIRP</b>: 180ms @ 880→1320Hz (tap feedback)</li>
        </ul>
      </div>
    </div>
  );
}
