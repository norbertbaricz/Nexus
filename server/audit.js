'use strict';
const { PERMISSION_DEFINITIONS } = require('./permissions');

// Audit summaries are bounded metadata; message content, secrets and image bytes stay out.
const AUDIT_LIMITS = Object.freeze({ entries:100, changes:32, valueLength:160, reasonLength:500 });
const FIELD_LABELS = Object.freeze({name:'Name',description:'Description',rules:'Server rules',welcomeMessage:'Welcome message',publicListing:'Discovery',defaultNotifications:'Default alerts',icon:'Icon',banner:'Banner',iconCrop:'Icon position',bannerCrop:'Banner position',defaultPermissions:'Default permissions',topic:'Topic',type:'Channel type',category:'Category',private:'Private access',allowedRoleIds:'Allowed roles',readOnly:'Read-only',allowMedia:'Camera and screen sharing',slowmodeSeconds:'Slowmode seconds',userLimit:'Participant limit',allowAttachments:'Attachments',cover:'Cover image',coverCrop:'Cover position',color:'Color',permissions:'Allowed permissions',deniedPermissions:'Denied permissions',displayMembers:'Separate member group'});
const PERMISSION_LABELS = Object.fromEntries(PERMISSION_DEFINITIONS.map(item=>[item.key,item.label]));
function auditValue(key,value) {
  if (['rules','welcomeMessage'].includes(key)) return `${String(value || '').length.toLocaleString('en-US')} characters`;
  if (['icon','banner','cover'].includes(key)) return value ? String(value).startsWith('/files/')?'Custom image':String(value) : 'None';
  if (key.endsWith('Crop')) { try {const crop=typeof value==='string'?JSON.parse(value):value;return `Position ${crop?.x??50}%, ${crop?.y??50}% · Zoom ${crop?.zoom??1}×`;}catch{return 'Default position';} }
  if (typeof value === 'boolean' || ['publicListing','private','readOnly','allowMedia','allowAttachments','displayMembers'].includes(key)) return value ? 'On' : 'Off';
  if (['permissions','deniedPermissions'].includes(key)) {const list=typeof value==='string'?JSON.parse(value):value;return list?.map(name=>PERMISSION_LABELS[name]||name).join(', ') || 'None';}
  if(key==='defaultPermissions'&&typeof value==='string'){try{return auditValue(key,JSON.parse(value));}catch{return 'Defaults';}}
  if (Array.isArray(value)) return value.join(', ') || 'None';
  if (value && typeof value === 'object') return Object.entries(value).map(([name,enabled])=>`${PERMISSION_LABELS[name]||name}: ${enabled?'On':'Off'}`).join(', ');
  return String(value ?? '') || 'Empty';
}
function changedFields(previous,next,keys=Object.keys(next)) {
  return keys.filter(key=>JSON.stringify(previous?.[key])!==JSON.stringify(next?.[key])).map(key=>({label:FIELD_LABELS[key]||PERMISSION_LABELS[key]||key,before:auditValue(key,previous?.[key]),after:auditValue(key,next?.[key])}));
}
function createAudit(db,{id,now}) {
  const shorten=value=>String(value??'').slice(0,AUDIT_LIMITS.valueLength);
  function write(serverId,actorId,action,targetId='',detail='',metadata={}) {
    let targetName=metadata.targetName || '';
    if(!targetName&&targetId)for(const [table,column] of [['channels','name'],['server_roles','name'],['categories','name'],['users','displayName'],['servers','name']]){const row=db.prepare(`SELECT ${column} AS name FROM ${table} WHERE id=?`).get(targetId);if(row){targetName=row.name;break;}}
    const data={targetName:shorten(targetName),changes:(metadata.changes||[]).slice(0,AUDIT_LIMITS.changes).map(change=>({label:shorten(change.label),before:shorten(change.before),after:shorten(change.after)}))};
    db.prepare('INSERT INTO audit_log(id,serverId,actorId,action,targetId,detail,createdAt,metadata) VALUES (?,?,?,?,?,?,?,?)').run(id('audit'),serverId,actorId,action,targetId,String(detail||'').slice(0,AUDIT_LIMITS.reasonLength),now(),JSON.stringify(data));
  }
  function list(serverId) {
    return db.prepare('SELECT a.*,u.displayName AS actorName,u.username AS actorUsername FROM audit_log a LEFT JOIN users u ON u.id=a.actorId WHERE a.serverId=? ORDER BY a.createdAt DESC,a.id DESC LIMIT ?').all(serverId,AUDIT_LIMITS.entries).map(row=>{let metadata={};try{metadata=JSON.parse(row.metadata||'{}');}catch{/* Older entries keep their human action label. */}return {...row,metadata};});
  }
  return {write,list};
}
module.exports={AUDIT_LIMITS,FIELD_LABELS,changedFields,createAudit};
