'use strict';
const {normalizeCrop}=require('./artwork');

// Code examples and escaped @ signs never create notification recipients.
const MENTION_PATTERN=/(?:^|[\s(*_~>#\[])@([a-z0-9_.]{3,24})\b/gi;
function mentionTokens(value) {
  const plain=String(value).replace(/```[^]*?(?:```|$)/g,' ').replace(/`[^`\n]*(?:`|$)/g,' ').replace(/\\@/g,' ');
  return new Set([...plain.matchAll(MENTION_PATTERN)].map(match=>match[1].toLowerCase()));
}
function markSpoilers(attachments,value,maxAttachments) {
  const keys=value ?? [];
  if(!Array.isArray(keys)||keys.length>maxAttachments||new Set(keys).size!==keys.length||keys.some(key=>typeof key!=='string'||!attachments.some(file=>file.id===key)))throw new Error('Choose valid attachment spoilers.');
  return attachments.map(file=>({...file,...(keys.includes(file.id)?{spoiler:true}:{})}));
}
function attachmentCrops(attachments,value,maxAttachments) {
  if(value===undefined)return attachments;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>maxAttachments||Object.keys(value).some(key=>!attachments.some(file=>file.id===key&&/^image\//.test(file.type))))throw new Error('Choose valid image previews.');
  const crops=Object.fromEntries(Object.entries(value).map(([key,crop])=>[key,normalizeCrop(crop)]));
  return attachments.map(file=>({...file,...(crops[file.id]?{previewCrop:crops[file.id]}:{})}));
}
module.exports={mentionTokens,markSpoilers,attachmentCrops};
