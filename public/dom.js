// Preserve live nodes, focus, scroll and image decoders during message and chrome updates.
function nodeKey(node) {
  if(node.nodeType!==1)return null;
  if(node.dataset.renderKey)return `key:${node.dataset.renderKey}`;
  if(node.id)return `id:${node.id}`;
  if(node.dataset.action&&node.dataset.id)return [node.tagName,node.dataset.action,node.dataset.id,node.dataset.index || '',node.dataset.emoji || '',node.dataset.direction || '',node.dataset.kind || ''].join(':');
  if(node.dataset.userId)return `${node.tagName}:user:${node.dataset.userId}`;
  return null;
}
function compatible(a,b){return a?.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName)&&nodeKey(a)===nodeKey(b);}
function patchNode(current,desired) {
  if(current.nodeType!==1){if(current.nodeValue!==desired.nodeValue)current.nodeValue=desired.nodeValue;return;}
  for(const attribute of [...current.attributes])if(!desired.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
  for(const attribute of desired.attributes)if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
  reconcile(current,desired);
}
function reconcile(parent,desiredParent) {
  const previous=[...parent.childNodes],keyed=new Map(),used=new Set();
  for(const node of previous){const key=nodeKey(node);if(key){if(!keyed.has(key))keyed.set(key,[]);keyed.get(key).push(node);}}
  let cursor=parent.firstChild;
  for(const desired of [...desiredParent.childNodes]) {
    const key=nodeKey(desired);let current=key?keyed.get(key)?.find(node=>!used.has(node)):null;
    if(!current&&!key&&cursor&&!used.has(cursor)&&compatible(cursor,desired))current=cursor;
    if(!current&&!key)current=previous.find(node=>!used.has(node)&&!nodeKey(node)&&compatible(node,desired));
    if(current&&!compatible(current,desired))current=null;
    if(!current)current=desired.cloneNode(true);else patchNode(current,desired);
    used.add(current);if(current!==cursor)parent.insertBefore(current,cursor);
    cursor=current.nextSibling;
  }
  for(const old of previous)if(!used.has(old))old.remove();
}
export function syncMarkup(root,html) {
  if(!root||root._nexusMarkup===html)return;
  const template=document.createElement('template');template.innerHTML=html;reconcile(root,template.content);root._nexusMarkup=html;
}
