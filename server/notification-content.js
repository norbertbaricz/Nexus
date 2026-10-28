'use strict';

// Keep encrypted pushes below provider limits and hide spoiler contents.
const NOTIFICATION_CONTENT = Object.freeze({ titleLength:96, bodyLength:240, nameLength:60, excerptLength:180, attachmentNames:2 });
function plain(value, maximum) {
  const text=String(value||'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
  const characters=Array.from(text);return characters.length>maximum?characters.slice(0,maximum-1).join('')+'…':text;
}
function excerpt(message) {
  const text=plain(String(message.text||'').replace(/\|\|[\s\S]*?(?:\|\||$)/g,'[Spoiler]').replace(/!\[([^\]]*)\]\([^)]*\)/g,'[Image]').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/(^|\n)\s{0,3}#{1,6}\s+/g,'$1').replace(/[*_`~]/g,''),NOTIFICATION_CONTENT.excerptLength);
  let files=message.attachments||[];if(typeof files==='string')try{files=JSON.parse(files);}catch{files=[];}
  const labels=(Array.isArray(files)?files:[]).slice(0,NOTIFICATION_CONTENT.attachmentNames).map(file=>{
    if(file.spoiler)return 'Spoiler attachment';
    const type=file.type||file.mime||'';
    if(file.provider||file.gifId||type==='image/gif')return 'GIF';
    if(type.startsWith('image/'))return 'Photo';if(type.startsWith('video/'))return 'Video';if(type.startsWith('audio/'))return 'Audio';
    return `File${file.name?' · '+plain(file.name,60):''}`;
  });
  if(Array.isArray(files)&&files.length>labels.length)labels.push(`+${files.length-labels.length} more`);
  return [text,...labels].filter(Boolean).join(' · ')||'Message';
}
function notificationContent(db,message) {
  const author=db.prepare('SELECT displayName,username FROM users WHERE id=?').get(message.authorId);
  const channel=db.prepare('SELECT c.name,s.name AS serverName FROM channels c JOIN servers s ON s.id=c.serverId WHERE c.id=?').get(message.conversationId);
  const name=plain(author?.displayName||'Nexus member',NOTIFICATION_CONTENT.nameLength),username=plain(author?.username,24),sender=name+(username?` (@${username})`:'');
  return {title:plain(channel?`${channel.serverName} · #${channel.name}`:sender,NOTIFICATION_CONTENT.titleLength),body:plain(channel?`${sender}: ${excerpt(message)}`:`Direct message · ${excerpt(message)}`,NOTIFICATION_CONTENT.bodyLength)};
}
module.exports={NOTIFICATION_CONTENT,notificationContent};
