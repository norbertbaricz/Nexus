'use strict';

// Synced values follow an account; panel sizes and OS permissions stay local.
const PREFERENCE_DEFAULTS = Object.freeze({ palette: 'coral', sounds: true, soundVolume: 45, motion: true, compact: false, gestures: true, mediaLayout: 'grid', forumLayout: 'grid' });
const PALETTE_KEYS = new Set(['coral','violet','blue','teal','green','gold','rose','slate','ruby','ember','citrus','mint','arctic','indigo','plum','sand']);
const BOOLEAN_KEYS = new Set(['sounds','motion','compact','gestures']);
function normalizePreferences(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length > Object.keys(PREFERENCE_DEFAULTS).length) throw new Error('Choose valid account preferences.');
  const values = {};
  for (const [key,value] of Object.entries(patch)) {
    const valid = BOOLEAN_KEYS.has(key) ? typeof value === 'boolean' : key === 'palette' ? PALETTE_KEYS.has(value) : key === 'soundVolume' ? Number.isInteger(value) && value >= 0 && value <= 100 : ['mediaLayout','forumLayout'].includes(key) && ['grid','list'].includes(value);
    if (!valid) throw new Error('Choose valid account preferences.');
    values[key] = value;
  }
  return values;
}
function installPreferences(app,{db,auth,HttpError,emitUsers}) {
  function snapshot(userId) {
    const row = db.prepare('SELECT * FROM user_preferences WHERE userId=?').get(userId);
    return { preferences: {...PREFERENCE_DEFAULTS,...(row ? JSON.parse(row.preferences) : {})}, revision: row?.revision || 0, updatedAt: row?.updatedAt || null };
  }
  app.get('/api/preferences',auth,(req,res)=>res.json(snapshot(req.userId)));
  app.patch('/api/preferences',auth,(req,res)=>{
    let patch;
    try { patch=normalizePreferences(req.body.preferences); } catch(error) { throw new HttpError(400,error.message); }
    const current=snapshot(req.userId),values={...current.preferences,...patch};
    if (Object.keys(patch).some(key=>current.preferences[key]!==values[key]) || !current.revision) {
      db.prepare('INSERT INTO user_preferences (userId,preferences,revision,updatedAt) VALUES (?,?,?,?) ON CONFLICT(userId) DO UPDATE SET preferences=excluded.preferences,revision=excluded.revision,updatedAt=excluded.updatedAt')
        .run(req.userId,JSON.stringify(values),current.revision+1,new Date().toISOString());
      const result=snapshot(req.userId);emitUsers([req.userId],'preferences:updated',result);return res.json(result);
    }
    res.json(current);
  });
  return {snapshot};
}
module.exports={PREFERENCE_DEFAULTS,normalizePreferences,installPreferences};
