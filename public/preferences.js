import { CONFIG } from './config.js';

export const SYNC_DEFAULTS=Object.freeze({palette:'coral',sounds:true,soundVolume:45,motion:true,compact:false,gestures:true,mediaLayout:'grid',forumLayout:'grid'});
const select=values=>Object.fromEntries(Object.keys(SYNC_DEFAULTS).filter(key=>Object.hasOwn(values,key)).map(key=>[key,values[key]]));
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
// Partial patches merge on the server; pending edits survive offline reloads.
export class PreferenceSync {
  constructor({request,onApply,onStatus}){Object.assign(this,{request,onApply,onStatus});this.userId=null;this.remote={...SYNC_DEFAULTS};this.revision=-1;this.pending={};this.busy=false;this.flight=null;this.timer=0;this.epoch=0;}
  detach(){this.persist();clearTimeout(this.timer);this.epoch++;this.userId=null;this.pending={};this.flight=null;this.busy=false;this.revision=-1;}
  storageKey(){return `${CONFIG.preferenceQueuePrefix}${this.userId}`;}
  persist(){if(!this.userId)return;try{localStorage.setItem(this.storageKey(),JSON.stringify({pending:this.pending,remote:this.remote,revision:this.revision}));}catch{/* Account sync still works without browser storage. */}}
  attach(userId,snapshot,local) {
    if(this.userId!==userId){clearTimeout(this.timer);this.epoch++;this.userId=userId;this.busy=false;this.flight=null;const saved=read(this.storageKey());this.pending=select(saved?.pending||{});this.remote={...SYNC_DEFAULTS};this.revision=-1;
      const owner=read(CONFIG.preferenceOwnerKey);if(snapshot.revision===0&&(!owner||owner===userId))this.pending={...select(local),...this.pending};
      try{localStorage.setItem(CONFIG.preferenceOwnerKey,JSON.stringify(userId));}catch{/* Optional migration marker. */}
    }
    this.accept(snapshot);if(Object.keys(this.pending).length)this.schedule();
  }
  accept(snapshot) {
    if(!snapshot||snapshot.revision<this.revision)return;
    this.remote={...SYNC_DEFAULTS,...select(snapshot.preferences||{})};this.revision=snapshot.revision;
    this.onApply({...this.remote,...this.pending});this.persist();this.status();
  }
  queue(values) {
    if(!this.userId)return;
    for(const [key,value] of Object.entries(select(values))) {if(value===this.remote[key]&&(!this.flight||!Object.hasOwn(this.flight,key)||this.flight[key]===value))delete this.pending[key];else if(value!==({...this.remote,...this.pending})[key])this.pending[key]=value;}
    this.persist();this.status();if(Object.keys(this.pending).length)this.schedule();
  }
  status(){this.onStatus(!Object.keys(this.pending).length?'synced':navigator.onLine===false?'offline':this.busy?'saving':'pending');}
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),CONFIG.preferenceSyncDebounceMs);}
  async flush() {
    if(!this.userId||this.busy||!Object.keys(this.pending).length)return;
    if(navigator.onLine===false){this.status();return;}
    const batch={...this.pending},epoch=this.epoch;this.busy=true;this.flight=batch;this.status();
    try {
      const result=await this.request('/api/preferences',{method:'PATCH',body:{preferences:batch}});if(epoch!==this.epoch)return;
      for(const [key,value] of Object.entries(batch))if(this.pending[key]===value)delete this.pending[key];
      this.accept(result);
    } catch(error){if(epoch===this.epoch){this.onStatus('offline');console.warn('[Nexus preferences] Sync will retry when the connection returns.');}}
    finally {if(epoch===this.epoch){this.busy=false;this.flight=null;this.persist();if(Object.keys(this.pending).length&&navigator.onLine!==false)this.timer=setTimeout(()=>this.flush(),CONFIG.preferenceRetryMs);else this.status();}}
  }
}
