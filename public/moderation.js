// Timeouts are authoritative on the server; the UI updates only their countdown text.
export function activeTimeout(server, now = Date.now()) {
  const entry = server?.moderation;
  return entry?.kind === 'mute' && (entry.expiresAt === null || entry.expiresAt > now) ? entry : null;
}
export function remainingTime(expiresAt, now = Date.now()) {
  if (expiresAt === null) return 'Permanent';
  let seconds = Math.max(0, Math.ceil((Number(expiresAt) - now) / 1000));
  if (!seconds) return 'Expired';
  return [[86400,'day'],[3600,'hour'],[60,'minute'],[1,'second']].map(([size,label])=>{
    const count=Math.floor(seconds/size);seconds%=size;return count?`${count} ${label}${count===1?'':'s'}`:'';
  }).filter(Boolean).join(' ');
}
