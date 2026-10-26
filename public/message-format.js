// A bounded Markdown subset. Raw HTML and executable URL schemes stay plain text.
export const FORMAT_CONFIG = Object.freeze({ maxLength: 8000, maxNesting: 5, maxLanguageLength: 24, maxEmojiOnlyLength: 64 });
export const escapeText = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const EMOJI_SHORTCODES = Object.freeze({sparkles:'✨',sparkle:'✨',heart:'❤️',wolf:'🐺',hug:'🫂',hugs:'🫂',shield:'🛡️',feet:'🐾',paw_prints:'🐾',warning:'⚠️',angry:'😠',lock:'🔒',no_entry_sign:'🚫',smile:'😄',grin:'😁',laughing:'😆',joy:'😂',sob:'😭',thinking:'🤔',eyes:'👀',wave:'👋',thumbsup:'👍',thumbsdown:'👎',fire:'🔥',star:'⭐',rocket:'🚀',tada:'🎉',check:'✅',white_check_mark:'✅',x:'❌',information_source:'ℹ️',bulb:'💡',sunny:'☀️',moon:'🌙',blue_heart:'💙',green_heart:'💚',purple_heart:'💜',black_heart:'🖤',white_heart:'🤍'});
const DELIMITERS = [['**','strong'],['__','u'],['~~','s'],['*','em'],['_','em']];
function safeLink(value) {
  try { const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null; } catch { return null; }
}
export function inlineMarkdown(value,{resolveMention}={},depth=0) {
  const text=String(value).slice(0,FORMAT_CONFIG.maxLength);let html='',index=0;
  while(index<text.length) {
    const rest=text.slice(index),char=text[index];
    if(char==='\\'&&index+1<text.length){html+=escapeText(text[index+1]);index+=2;continue;}
    if(char==='`') {
      const end=text.indexOf('`',index+1);
      if(end>index+1){html+=`<code>${escapeText(text.slice(index+1,end))}</code>`;index=end+1;continue;}
    }
    if(char===':'){const match=/^:([a-z0-9_+-]{1,32}):/i.exec(rest),emoji=match&&EMOJI_SHORTCODES[match[1].toLowerCase()];if(emoji){html+=emoji;index+=match[0].length;continue;}}
    if(char==='['&&depth<FORMAT_CONFIG.maxNesting) {
      const labelEnd=text.indexOf('](',index+1),urlEnd=labelEnd>=0?text.indexOf(')',labelEnd+2):-1;
      if(labelEnd>=0&&urlEnd>labelEnd+2) {
        const url=safeLink(text.slice(labelEnd+2,urlEnd));
        if(url){html+=`<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">${inlineMarkdown(text.slice(index+1,labelEnd),{},depth+1)}</a>`;index=urlEnd+1;continue;}
      }
    }
    const urlMatch=/^https?:\/\/[^\s<>]+/i.exec(rest);
    if(urlMatch) {
      const candidate=urlMatch[0].replace(/[.,!?;:)\]}]+$/,'');const url=safeLink(candidate);
      if(url&&candidate){html+=`<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">${escapeText(candidate)}</a>`;index+=candidate.length;continue;}
    }
    if(char==='@'&&(index===0||/[\s(]/.test(text[index-1]))) {
      const match=/^@([a-z0-9_.]{3,24})\b/i.exec(rest),mention=match&&resolveMention?.(match[1].toLowerCase());
      if(mention){html+=mention.group?`<span class="mention group-mention">@${escapeText(mention.label)}</span>`:`<button class="mention" data-action="profile" data-id="${escapeText(mention.id)}">@${escapeText(mention.label)}</button>`;index+=match[0].length;continue;}
    }
    let formatted=false;
    if(depth<FORMAT_CONFIG.maxNesting)for(const [delimiter,tag] of DELIMITERS) {
      if(!rest.startsWith(delimiter)||delimiter.includes('_')&&index>0&&/\w/.test(text[index-1]))continue;
      const end=text.indexOf(delimiter,index+delimiter.length),inner=text.slice(index+delimiter.length,end);
      if(end>index+delimiter.length&&inner.trim()===inner&&!inner.includes('\n')){html+=`<${tag}>${inlineMarkdown(inner,{resolveMention},depth+1)}</${tag}>`;index=end+delimiter.length;formatted=true;break;}
    }
    if(formatted)continue;html+=escapeText(char);index++;
  }
  return html;
}
export function markdown(value,options={}) {
  const raw=String(value??'').trim();if(raw&&raw.length<=FORMAT_CONFIG.maxEmojiOnlyLength&&/^[\p{Extended_Pictographic}\p{Regional_Indicator}\s\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]+$/u.test(raw))return `<p><span class="emoji-message">${escapeText(raw)}</span></p>`;
  const lines=String(value ?? '').slice(0,FORMAT_CONFIG.maxLength).replace(/\r\n?/g,'\n').split('\n');
  let html='',paragraph=[],list=null,code=null,language='';
  const flushParagraph=()=>{if(paragraph.length){html+=`<p>${paragraph.map(line=>inlineMarkdown(line,options)).join('<br>')}</p>`;paragraph=[];}};
  const closeList=()=>{if(list){html+=`</${list}>`;list=null;}};
  for(const line of lines) {
    if(code){if(/^\s*```\s*$/.test(line)){html+=`<pre><code${language?` data-language="${escapeText(language)}"`:''}>${escapeText(code.join('\n'))}</code></pre>`;code=null;}else code.push(line);continue;}
    const fence=/^\s*```([\w+-]*)\s*$/.exec(line);
    if(fence){flushParagraph();closeList();code=[];language=fence[1].slice(0,FORMAT_CONFIG.maxLanguageLength);continue;}
    if(!line.trim()){flushParagraph();closeList();continue;}
    const heading=/^(#{1,3})(?:\s+|(?=[^#\s]))(.+)$/.exec(line);
    if(heading){flushParagraph();closeList();html+=`<h${heading[1].length}>${inlineMarkdown(heading[2],options)}</h${heading[1].length}>`;continue;}
    const item=/^\s*(?:(- |\* )|(\d+\. ))(.+)$/.exec(line);
    if(item){flushParagraph();const type=item[2]?'ol':'ul';if(list!==type){closeList();html+=`<${type}>`;list=type;}html+=`<li>${inlineMarkdown(item[3],options)}</li>`;continue;}
    closeList();
    if(/^>\s?/.test(line)){flushParagraph();html+=`<blockquote>${inlineMarkdown(line.replace(/^>\s?/,''),options)}</blockquote>`;continue;}
    paragraph.push(line);
  }
  flushParagraph();closeList();if(code)html+=`<pre><code>${escapeText(code.join('\n'))}</code></pre>`;
  return html;
}
