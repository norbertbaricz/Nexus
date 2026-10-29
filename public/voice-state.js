// An HTTP snapshot must not roll back room updates received while it was loading.
// Only pending requests retain room IDs; no voice history or account data is stored.
export class VoiceSnapshots {
  constructor() { this.pending=new Set();this.generation=0;this.sequence=0;this.applied=0; }
  begin(accountId) { const ticket={accountId,generation:this.generation,sequence:++this.sequence,changed:new Set()};this.pending.add(ticket);return ticket; }
  current(ticket) { return this.pending.has(ticket)&&ticket.generation===this.generation&&ticket.sequence>=this.applied; }
  changed(conversationId) { if(typeof conversationId==='string')for(const ticket of this.pending)ticket.changed.add(conversationId); }
  merge(ticket,snapshot,current,allowed) {
    if(!this.current(ticket))return null;
    const changed=ticket.changed,permitted=participant=>!allowed||allowed.has(participant.conversationId);
    const merged=[...(snapshot||[]).filter(participant=>!changed.has(participant.conversationId)),...(current||[]).filter(participant=>changed.has(participant.conversationId))].filter(permitted);
    this.applied=ticket.sequence;return merged;
  }
  finish(ticket) { this.pending.delete(ticket); }
  reset() { ++this.generation;this.pending.clear();this.applied=this.sequence; }
}
