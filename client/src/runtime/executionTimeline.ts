import type { Event } from '@/types/coach';

type Sub = (ev: Event) => void;
export class ExecutionTimeline {
  private subs: Sub[] = [];
  subscribe(fn: Sub){ 
    this.subs.push(fn); 
    return () => { this.subs = this.subs.filter(s => s!==fn); }; 
  }
  private emit(ev: Event){ this.subs.forEach(s => s(ev)); }

  start(blocks: Array<{id:string; params:{ awaitReadyBeforeStart?: boolean }}>, opts:{ strictEMOM: boolean }){
    const block = blocks[0];
    this.emit({ type:'EV_BLOCK_START', blockId:block.id });
    if (block.params.awaitReadyBeforeStart) {
      this.emit({ type:'EV_AWAIT_READY', blockId:block.id });
      // UI should call resumeAfterReady() when user confirms.
    } else {
      this.resumeAfterReady(block.id);
    }
  }

  resumeAfterReady(blockId: string){
    this.emit({ type:'EV_COUNTDOWN', sec:3 });
    
    // Countdown complete → start first exercise
    setTimeout(() => {
      this.emit({ type:'EV_WORK_START', exerciseId:'ex-1' });
      
      // After 5 seconds → end work, start rest
      setTimeout(() => {
        this.emit({ type:'EV_WORK_END', exerciseId:'ex-1' });
        this.emit({ type:'EV_REST_START', sec:90, reason:'between_sets' });
        
        // After 3 seconds → end rest, start round rest
        setTimeout(() => {
          this.emit({ type:'EV_REST_END' });
          this.emit({ type:'EV_ROUND_REST_START', sec:60 });
          
          // After 3 seconds → end round rest, end block
          setTimeout(() => {
            this.emit({ type:'EV_ROUND_REST_END' });
            this.emit({ type:'EV_BLOCK_END', blockId });
            
            // After 2 seconds → workout complete
            setTimeout(() => {
              this.emit({ type:'EV_WORKOUT_END' });
            }, 2000);
          }, 3000);
        }, 3000);
      }, 5000);
    }, 3000);
  }
}
