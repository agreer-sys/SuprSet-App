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
    setTimeout(() => {
      this.emit({ type:'EV_WORK_START', exerciseId:'ex-1' });
      setTimeout(() => {
        this.emit({ type:'EV_WORK_END', exerciseId:'ex-1' });
        this.emit({ type:'EV_REST_START', sec:90, reason:'between_sets' });
        // …continue emitting events per your compiled timeline
      }, 3000);
    }, 3000);
  }
}
