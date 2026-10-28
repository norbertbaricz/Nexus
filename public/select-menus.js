import { icon } from './icons.js';

// Native selects retain form semantics; a portal gives their menus the app theme.
export const SELECT_CONFIG = Object.freeze({ maxHeight: 296, edge: 12, optionHeight: 40, typeaheadMs: 700 });
export class SelectMenus {
  constructor(root) {
    this.root=root;this.serial=0;this.portal=document.createElement('div');this.portal.id='select-menu-root';document.body.append(this.portal);
    this.observer=new MutationObserver(records=>{if(this.select&&!this.select.isConnected)this.close();this.enhance();for(const record of records)if(record.type==='attributes'&&record.target.tagName==='SELECT')this.sync(record.target);});this.observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    root.addEventListener('change',event=>{if(event.target.tagName==='SELECT')this.sync(event.target);});
    document.addEventListener('click',event=>{const trigger=event.target.closest('[data-select-trigger]');if(trigger){event.preventDefault();const select=document.getElementById(trigger.dataset.selectTrigger);if(this.select===select)this.close();else this.open(select,trigger);return;}const option=event.target.closest('[data-select-option]');if(option){event.preventDefault();this.choose(Number(option.dataset.selectOption));return;}if(!this.portal.contains(event.target))this.close();});
    document.addEventListener('keydown',event=>this.keydown(event),true);
    document.addEventListener('scroll',event=>{if(this.select&&!this.portal.contains(event.target)&&!this.positionFrame)this.positionFrame=requestAnimationFrame(()=>{this.positionFrame=0;this.position();});},true);window.addEventListener('resize',()=>this.close());
    this.enhance();
  }
  enhance() {
    for(const select of this.root.querySelectorAll('select:not([data-themed-select])')){
      if(select.multiple)continue;select.dataset.themedSelect='true';if(!select.id)select.id=`select-${++this.serial}`;
      const trigger=document.createElement('button');trigger.type='button';trigger.className='menu-select';trigger.dataset.selectTrigger=select.id;trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
      const label=select.getAttribute('aria-label')||this.root.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent||'Choose an option';trigger.setAttribute('aria-label',label.trim());select.hidden=true;select.after(trigger);this.sync(select);
    }
  }
  sync(select) {const trigger=select.nextElementSibling;if(!trigger?.matches('.menu-select'))return;const label=select.selectedOptions[0]?.textContent||'Choose an option';if(trigger.querySelector('span')?.textContent!==label){trigger.innerHTML=`<span></span>${icon('chevron',18)}`;trigger.querySelector('span').textContent=label;}if(trigger.disabled!==select.disabled)trigger.disabled=select.disabled;}
  open(select,trigger) {
    if(!select||select.disabled)return;this.close();this.select=select;this.trigger=trigger;this.options=[...select.options].filter(option=>!option.hidden);this.index=Math.max(0,this.options.findIndex(option=>option.selected));
    trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls','select-options');
    this.portal.innerHTML='<div id="select-options" class="select-options" role="listbox"></div>';const list=this.portal.firstElementChild;list.setAttribute('aria-label',trigger.getAttribute('aria-label'));
    this.options.forEach((option,index)=>{const item=document.createElement('button');item.type='button';item.className='select-option';item.dataset.selectOption=index;item.id=`select-option-${index}`;item.setAttribute('role','option');item.tabIndex=-1;item.disabled=option.disabled;item.textContent=option.textContent;list.append(item);});
    this.position();this.highlight();
  }
  position() {
    const trigger=this.trigger,list=this.portal.firstElementChild;if(!this.select||!trigger?.isConnected||!list)return;
    const box=trigger.getBoundingClientRect(),viewport=window.visualViewport,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
    if(box.bottom<=top||box.top>=top+height){this.close();return;}
    for(let parent=trigger.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
      if(!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY))continue;
      const bounds=parent.getBoundingClientRect();if(box.bottom<=bounds.top||box.top>=bounds.bottom){this.close();return;}
    }
    const availableBelow=top+height-box.bottom-SELECT_CONFIG.edge,availableAbove=box.top-top-SELECT_CONFIG.edge,wanted=Math.min(SELECT_CONFIG.maxHeight,this.options.length*SELECT_CONFIG.optionHeight+10),below=availableBelow>=Math.min(wanted,160)||availableBelow>=availableAbove;
    list.style.width=`${Math.min(box.width,width-SELECT_CONFIG.edge*2)}px`;list.style.left=`${Math.max(SELECT_CONFIG.edge,Math.min(box.left,width-box.width-SELECT_CONFIG.edge))}px`;list.style.maxHeight=`${Math.max(80,Math.min(wanted,below?availableBelow:availableAbove))}px`;list.style.top='';list.style.bottom='';if(below)list.style.top=`${box.bottom+4}px`;else list.style.bottom=`${window.innerHeight-box.top+4}px`;
  }
  highlight(){const list=this.portal.firstElementChild;if(!list)return;[...list.children].forEach((item,index)=>{item.classList.toggle('active',index===this.index);item.setAttribute('aria-selected',String(index===this.index));});this.trigger.setAttribute('aria-activedescendant',`select-option-${this.index}`);const item=list.children[this.index];if(item.offsetTop<list.scrollTop)list.scrollTop=item.offsetTop;else if(item.offsetTop+item.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=item.offsetTop+item.offsetHeight-list.clientHeight;}
  choose(index){const select=this.select,option=this.options?.[index],trigger=this.trigger;if(!select||!option||option.disabled)return;const changed=select.value!==option.value;select.value=option.value;this.sync(select);this.close();if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}if(trigger?.isConnected)trigger.focus({preventScroll:true});}
  keydown(event){
    const trigger=event.target.closest('[data-select-trigger]');if(!this.select&&trigger&&['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();this.open(document.getElementById(trigger.dataset.selectTrigger),trigger);return;}
    if(!this.select)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close();return;}if(event.key==='Tab'){this.close();return;}
    if(!trigger&&event.target!==this.trigger)return;
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Enter'||event.key===' '){this.choose(this.index);return;}let next=event.key==='Home'?0:event.key==='End'?this.options.length-1:this.index+(event.key==='ArrowDown'?1:-1);const step=event.key==='ArrowUp'||event.key==='End'?-1:1;while(this.options[next]?.disabled)next+=step;this.index=Math.max(0,Math.min(this.options.length-1,next));this.highlight();}
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();const time=Date.now();this.typed=(time-(this.typedAt||0)>SELECT_CONFIG.typeaheadMs?'':this.typed||'')+event.key.toLowerCase();this.typedAt=time;const at=this.options.findIndex(option=>!option.disabled&&option.textContent.toLowerCase().startsWith(this.typed));if(at>=0){this.index=at;this.highlight();}}
  }
  close(){if(this.positionFrame){cancelAnimationFrame(this.positionFrame);this.positionFrame=0;}if(this.trigger){this.trigger.setAttribute('aria-expanded','false');this.trigger.removeAttribute('aria-activedescendant');this.trigger.removeAttribute('aria-controls');}this.portal.replaceChildren();this.select=null;this.trigger=null;this.options=null;this.typed='';}
}
