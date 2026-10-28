// Processing belongs to the host. Viewers only observe one authorized file at a time.
export const FILE_PLAYBACK_CONFIG=Object.freeze({pollMs:5000,idlePollMs:15000,requestTimeoutMs:10000});
export class VideoPlayback {
  constructor({request,onStatus=()=>{},onReady=()=>{},visible=()=>globalThis.document?.visibilityState!=='hidden',schedule=(action,delay)=>setTimeout(action,delay),cancel=timer=>clearTimeout(timer)}) {
    Object.assign(this,{request,onStatus,onReady,visible,schedule,cancel});this.epoch=0;this.timers=new Set();this.state='';
  }
  timer(action,delay) {const id=this.schedule(()=>{this.timers.delete(id);action();},delay);this.timers.add(id);return id;}
  stopTimer(id) {if(id!=null){this.cancel(id);this.timers.delete(id);}}
  setState(state) {if(this.state!==state){this.state=state;this.onStatus(state);}}
  attach(video,file) {
    this.close();this.video=video;this.id=file.url?.match(/^\/files\/(f_[a-zA-Z0-9_-]+)$/)?.[1]||'';this.optimized=false;
    if(!this.id)return;this.setState('queued');this.poll();
  }
  async poll() {
    const epoch=this.epoch;if(!this.id||this.optimized)return;
    if(!this.visible()){this.timer(()=>this.poll(),FILE_PLAYBACK_CONFIG.idlePollMs);return;}
    const controller=this.controller=new AbortController(),timeout=this.timer(()=>controller.abort(),FILE_PLAYBACK_CONFIG.requestTimeoutMs);let delay=FILE_PLAYBACK_CONFIG.pollMs;
    try{
      const result=await this.request(`/api/files/${this.id}/playback`,{signal:controller.signal});if(epoch!==this.epoch)return;
      if(result?.state==='ready'&&this.ready(result.url))return;
      this.setState(result?.state==='ready'?'queued':result?.state||'queued');
      if(result?.state==='failed')return;
      if(result?.state==='unavailable')delay=FILE_PLAYBACK_CONFIG.idlePollMs;
    }catch{/* Native playback remains available during a transient status request failure. */}
    finally{this.stopTimer(timeout);}
    if(epoch===this.epoch&&!this.optimized)this.timer(()=>this.poll(),delay);
  }
  ready(url) {
    if(this.optimized||url!==`/files/${this.id}?variant=compat`)return false;
    this.optimized=true;for(const timer of this.timers)this.cancel(timer);this.timers.clear();this.setState('ready');this.onReady(url);return true;
  }
  close() {
    this.epoch++;this.controller?.abort();for(const timer of this.timers)this.cancel(timer);this.timers.clear();this.video=null;this.id='';this.state='';
  }
}
