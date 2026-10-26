'use strict';

// A monotonic counter survives unpins/deletions; only visible pins affect badges.
function installPins(app,{db,auth,access,recipients,activeUsers,emitUsers,HttpError}) {
  function state(conversationId,userId) {
    const visible=db.prepare(`SELECT count(*) AS count,coalesce(max(pinRevision),0) AS revision FROM messages
      WHERE conversationId=? AND pinned=1 AND authorId NOT IN (SELECT targetId FROM blocks WHERE ownerId=?)
      AND NOT EXISTS (SELECT 1 FROM messages root JOIN blocks b ON b.targetId=root.authorId WHERE root.id=messages.threadId AND b.ownerId=?)`).get(conversationId,userId,userId);
    const seenRevision=db.prepare('SELECT revision FROM pin_reads WHERE conversationId=? AND userId=?').get(conversationId,userId)?.revision || 0;
    return {...visible,seenRevision,hasNew:visible.revision>seenRevision};
  }
  function next(conversationId) {
    return db.prepare('INSERT INTO pin_counters (conversationId,revision) VALUES (?,1) ON CONFLICT(conversationId) DO UPDATE SET revision=revision+1 RETURNING revision').get(conversationId).revision;
  }
  function notify(conversationId) {
    for (const userId of recipients(conversationId)) if(activeUsers.get(userId)?.size) emitUsers([userId],'pins:updated',{conversationId,pins:state(conversationId,userId)});
  }
  app.post('/api/conversations/:id/pins/read',auth,(req,res)=>{
    access(req.params.id,req.userId);const current=state(req.params.id,req.userId);
    const requested=req.body.revision??current.revision;if(!Number.isInteger(requested)||requested<0)throw new HttpError(400,'Choose a valid pin revision.');
    db.prepare('INSERT INTO pin_reads (conversationId,userId,revision) VALUES (?,?,?) ON CONFLICT(conversationId,userId) DO UPDATE SET revision=max(revision,excluded.revision)').run(req.params.id,req.userId,Math.min(requested,current.revision));
    const result=state(req.params.id,req.userId);emitUsers([req.userId],'pins:read',{conversationId:req.params.id,pins:result});res.json({pins:result});
  });
  return {state,next,notify};
}
module.exports={installPins};
