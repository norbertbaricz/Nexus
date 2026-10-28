'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const urls=new Map();
function moduleURL(name){
  if(urls.has(name))return urls.get(name);
  const source=readFileSync(path.join(__dirname,'../public',name),'utf8').replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${moduleURL(path.posix.join(path.posix.dirname(name),relative))}'`);
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(name,url);return url;
}
test('emoji search spans the existing catalog, accepts words and glyphs, and bounds safe results',async()=>{
 const {searchEmoji,emojiPicker,emojiGrid,EMOJI_SEARCH_CONFIG}=await import(moduleURL('pickers.js'));
 for(const [query,emoji] of [['heart','❤️'],['pizza','🍕'],['wolf','🐺'],[':thumbs_up:','👍'],['computer','💻'],['fire','🔥'],['🔥','🔥'],['inimă','❤️']])assert.ok(searchEmoji(query).some(item=>item.emoji===emoji),query);
 const all=searchEmoji('face');assert.ok(all.length<=EMOJI_SEARCH_CONFIG.maxResults);assert.equal(new Set(all.map(item=>item.emoji)).size,all.length);
 assert.equal(searchEmoji('not-a-real-emoji-query').length,0);assert.ok(searchEmoji('','Food').every(item=>item.category==='Food'));
 const html=emojiPicker('insert-emoji','<unsafe>');assert.ok(html.includes('aria-label="Search emoji"'));assert.ok(!html.includes('autofocus'));assert.ok(!html.includes('<unsafe>'));
 const safe=emojiGrid('Faces','insert-emoji','<unsafe>','<img src=x>');assert.ok(safe.includes('No emoji found'));assert.ok(!safe.includes('<img'));
});
test('GIPHY searches use bounded client-side requests, exact encoded terms and pagination',async()=>{
  const {searchGiphy}=await import(moduleURL('pickers.js'));let request;
  const controller=new AbortController();
  const result=await searchGiphy({key:'disposable-web-key',query:'cat & dance 😄',offset:24,signal:controller.signal,fetcher:async(url,options)=>{
    request={url:new URL(url),options};return Response.json({data:[{id:'Abc123',title:'A cat',images:{fixed_height:{url:'https://media.giphy.com/media/Abc123/200.gif'},fixed_width_small:{url:'https://media.giphy.com/media/Abc123/100.gif'},fixed_width_small_still:{url:'https://media.giphy.com/media/Abc123/100_s.gif?cid=unchanged'}}}],pagination:{count:1,total_count:70}});
  }});
  assert.equal(request.url.origin,'https://api.giphy.com');assert.equal(request.url.pathname,'/v1/gifs/search');
  assert.equal(request.url.searchParams.get('q'),'cat & dance 😄');assert.equal(request.url.searchParams.get('offset'),'24');assert.equal(request.url.searchParams.get('limit'),'24');assert.equal(request.url.searchParams.get('rating'),'pg');
  assert.equal(request.options.credentials,'omit');assert.equal(request.options.signal,controller.signal);assert.equal(result.nextOffset,25);assert.equal(result.hasMore,true);assert.equal(result.gifs[0].provider,'giphy');
  assert.equal(result.gifs[0].still,'https://media.giphy.com/media/Abc123/100_s.gif?cid=unchanged');
});
test('legacy GIF still lookup uses the provider endpoint without rewriting returned media URLs',async()=>{
  const {lookupGiphyStill}=await import(moduleURL('pickers.js'));let request;
  const source='https://media.giphy.com/media/ABC/200.gif',still='https://media2.giphy.com/media/ABC/200_s.gif?cid=original&rid=200';
  assert.equal(await lookupGiphyStill({key:'fixture',source,fetcher:async(url,options)=>{request={url:new URL(url),options};return Response.json({data:{images:{fixed_height_still:{url:still}}}});}}),still);
  assert.equal(request.url.origin,'https://api.giphy.com');assert.equal(request.url.pathname,'/v1/gifs/ABC');assert.equal(request.options.credentials,'omit');
  assert.equal(await lookupGiphyStill({key:'',source,fetcher:()=>{throw new Error('must not request');}}),'');
  assert.equal(await lookupGiphyStill({key:'fixture',source,fetcher:async()=>Response.json({data:{images:{fixed_height_still:{url:'https://evil.example/ABC/200_s.gif'}}}})}),'');
});
test('GIF trending, provider failure, empty results and cancellation are explicit',async()=>{
  const {searchGiphy}=await import(moduleURL('pickers.js'));let endpoint;
  const empty=await searchGiphy({key:'disposable-key',fetcher:async url=>{endpoint=new URL(url);return Response.json({data:[],pagination:{count:0,total_count:0}});}});
  assert.equal(endpoint.pathname,'/v1/gifs/trending');assert.equal(endpoint.searchParams.has('q'),false);assert.deepEqual(empty.gifs,[]);assert.equal(empty.hasMore,false);
  await assert.rejects(searchGiphy({key:'key',fetcher:async()=>new Response('',{status:429})}),/busy/);
  await assert.rejects(searchGiphy({key:'key',fetcher:async()=>{throw new DOMException('Cancelled','AbortError');}}),{name:'AbortError'});
});
test('appearance palettes keep dark surface lightness and update all shared tokens',async()=>{
  const {PALETTES,paletteTokens,applyPalette}=await import(moduleURL('appearance.js'));
  assert.equal(Object.keys(PALETTES).length,16);
  for(const key of Object.keys(PALETTES)){
    const tokens=paletteTokens(key);assert.match(tokens['--bg'],/7%/);assert.match(tokens['--surface'],/14%/);assert.ok(tokens['--accent-text']);assert.ok(tokens['--input']);assert.ok(tokens['--elevated']);
  }
  const properties=new Map(),root={dataset:{},style:{setProperty:(key,value)=>properties.set(key,value)}};
  applyPalette('teal',root);assert.equal(root.dataset.palette,'teal');assert.equal(properties.get('--accent'),PALETTES.teal.accent);
  applyPalette('invalid',root);assert.equal(root.dataset.palette,'coral');
});
