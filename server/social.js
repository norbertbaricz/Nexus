'use strict';

// Cache only block IDs. Bounds are shared with the server's permission cache.
function installSocial(app, { db, config, auth, HttpError, getUser, now, onChange }) {
  const list=db.prepare('SELECT targetId FROM blocks WHERE ownerId=? ORDER BY createdAt DESC'),cache=new Map();
  function targets(ownerId) {
    if(cache.has(ownerId))return cache.get(ownerId);
    if(cache.size>=config.permissionCacheEntries)cache.delete(cache.keys().next().value);
    const values=new Set(list.all(ownerId).map(row=>row.targetId));cache.set(ownerId,values);return values;
  }
  const isBlocked=(ownerId,targetId)=>targets(ownerId).has(targetId);
  const pairBlocked=(a,b)=>isBlocked(a,b)||isBlocked(b,a);
  const ids=ownerId=>[...targets(ownerId)];
  app.get('/api/blocks',auth,(req,res)=>res.json({users:ids(req.userId).map(getUser)}));
  app.put('/api/blocks/:id',auth,(req,res)=>{
    if(req.params.id===req.userId)throw new HttpError(400,'You cannot block yourself.');
    if(!getUser(req.params.id))throw new HttpError(404,'User not found.');
    if(!isBlocked(req.userId,req.params.id)&&targets(req.userId).size>=config.maxBlockedUsers)throw new HttpError(400,`You can block up to ${config.maxBlockedUsers.toLocaleString('en-US')} accounts.`);
    db.prepare('INSERT OR IGNORE INTO blocks VALUES (?,?,?)').run(req.userId,req.params.id,now());cache.delete(req.userId);onChange(req.userId,req.params.id,true);res.json({ok:true});
  });
  app.delete('/api/blocks/:id',auth,(req,res)=>{
    db.prepare('DELETE FROM blocks WHERE ownerId=? AND targetId=?').run(req.userId,req.params.id);cache.delete(req.userId);onChange(req.userId,req.params.id,false);res.json({ok:true});
  });
  return {isBlocked,pairBlocked,ids,clearCache:()=>cache.clear()};
}
module.exports={installSocial};
