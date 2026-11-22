'use strict';
// Display only: judgments, effects and provenance arrive from Python.
function tagsOf(s,module) {return [...(s.ranking.tags||[]),...(s.display_tags||[])].filter(t=>(!module||t.module===module)&&!(t.module==='cost'&&t.dimension==='coverage'));}
function tagClass(t) {
  if(['good','warn','mismatch','pending','neutral'].includes(t.display_tone))return t.display_tone==='neutral'?'':t.display_tone;
  if(t.effect==='exclude')return 'bad';
  if(t.effect==='review')return 'warn';
  // Image availability is positive even when photo provenance is still unknown.
  // Release reference images and the separate provenance tag remain neutral.
  if(t.module==='images'&&['supplied','seller_item_photo'].includes(t.dimension)&&t.state==='present'&&Number(t.observed)>0)return 'good';
  return ['match','pass','eligible'].includes(t.state)?'good':['conflict','invalid'].includes(t.state)?'warn':'';
}
function tagValue(v,t) {
  if(typeof v==='string'&&v.startsWith('unresolved-'))return '未提供（作品级测试占位符）';
  if(v===null||v===undefined||v==='')return '未提供';
  if(t?.module==='decision')return t.label==='已满足本轮规则'?'满足匹配':t.label;
  if(t?.dimension==='lowest_path'&&typeof v==='object')return cash(v.cost_cny);
  if(t?.dimension==='coverage'&&Array.isArray(v))return v.map(warehouseName).join('、');
  if(t?.unit==='percent'&&typeof v==='number')return v.toFixed(2)+'%';
  if(t?.unit==='count'&&typeof v==='number')return v+'次';
  if(Array.isArray(v))return v.length?v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join('、'):'未提供';
  if(typeof v==='object')return JSON.stringify(v);
  return String(v);
}
function tagPill(t,view={}) {
  const label=t.module==='decision'&&t.label==='已满足本轮规则'?'满足匹配':t.label;
  const detail=(t.target!==null?'目标：'+tagValue(t.target,t)+'；':'')+'货源：'+tagValue(t.observed,t)+(t.reason?'；'+t.reason:'');
  return '<span class="pill operator-tag '+(view.tone??tagClass(t))+'" data-tag-code="'+escape(t.code)+'" aria-label="'+escape(label)+'" title="'+escape(label+'；'+detail)+'">'+escape(view.label??label)+'</span>';
}
function tagStrip(s,module,dimensions) {return '<div class="tag-strip">'+tagsOf(s,module).filter(t=>!dimensions||dimensions.includes(t.dimension)).map(tagPill).join('')+'</div>';}
function decisionTag(s) {return tagsOf(s,'decision').map(tagPill).join('');}
function attentionTags(s) {return tagsOf(s).filter(t=>t.module!=='decision'&&['review','exclude'].includes(t.effect));}
function attentionText(s) {return [...new Set(attentionTags(s).map(t=>t.label))].join('、');}
function pathLabel(s) {return tagsOf(s,'cost').find(t=>t.dimension==='lowest_path')?.label||'暂无可计算路径';}
function coverageLabel(s) {return tagsOf(s,'cost').find(t=>t.dimension==='coverage')?.label||'';}
function versionCardTags(s) {
  const versions=tagsOf(s,'version').filter(t=>['release_id','barcode'].includes(t.dimension));
  return '<div class="tag-strip">'+versions.map(tagPill).join('')+'</div>';
}
function sellerComments(s) {
  const raw=s.condition?.original_condition?.comments;
  if(typeof raw!=='string'||!raw.trim())return '<div class="seller-comments-empty">卖家评论（原文）<span>未提供</span></div>';
  return '<button type="button" class="seller-comments-trigger" data-seller-comments="'+escape(s.id)+'" aria-haspopup="dialog" aria-controls="seller-comment-viewer"><span>卖家评论（原文）</span><span class="comments-action">查看全文 ↗</span></button>';
}
// Parse only inside an inert template; output remains plain text, with no remote
// images, links, styles or scripts mounted into the workbench.
function sellerCommentReadText(raw) {
  if(!/<\/?(?:p|div|br|table|tr|td|th|ul|ol|li|font|b|strong|i|em|a|span|h[1-6])\b/i.test(raw))return raw;
  const template=document.createElement('template');template.innerHTML=raw;
  const blocks=new Set(['P','DIV','TABLE','TR','UL','OL','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','PRE','DL','DT','DD']);
  const ignored=new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','OBJECT','TEMPLATE']);
  function read(node) {
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1&&node.nodeType!==11)return '';
    if(ignored.has(node.nodeName))return '';
    if(node.nodeName==='BR'||node.nodeName==='HR')return '\n';
    if(node.nodeName==='IMG')return node.getAttribute('alt')||'';
    let text=Array.from(node.childNodes,read).join('');
    if(node.nodeName==='A'){
      const href=node.getAttribute('href')||'';
      if(/^https?:\/\//i.test(href)&&!text.includes(href))text+=' ('+href+')';
    }
    if(node.nodeName==='TD'||node.nodeName==='TH')return text+'\t';
    return blocks.has(node.nodeName)?'\n'+text+'\n':text;
  }
  return read(template.content).replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()||raw;
}
function obiCardTag(s) {
  const facts=s.unified_facts||{},items=facts.items||[];
  const conflict=(facts.issues||[]).some(issue=>/(?:^|[.\[])obi(?:$|[.\[])/.test(String(issue.field||'')));
  const value=items.length===1&&!conflict?items[0].obi:null;
  const state=value===true?'present':value===false?'absent':'unknown';
  const label={present:'有侧标',absent:'无侧标',unknown:'待确认'}[state];
  const reason=conflict?'侧标信息存在未解决的冲突。':items.length>1?'含多个商品，侧标归属待确认。':
    state==='unknown'?'本货源未提供明确的侧标信息；未知不等于无侧标。':'依据本货源整合后的侧标字段，不代表实物已查验。';
  return {code:'condition.obi.'+state,module:'condition',dimension:'obi',state,label,
    observed:state==='unknown'?null:label,target:null,effect:'info',reason,
    display_tone:state==='present'?'good':'neutral',evidence:[]};
}
function cardTagGroups(s,{compact=false}={}) {
  const comparison=(module,dimension)=>{
    const choices=tagsOf(s,module).filter(t=>t.dimension===dimension);
    // Prefer unresolved conflicts over a duplicate positive tag.
    const chosen=choices.find(t=>['conflict','invalid','review'].includes(t.state))||choices.find(t=>t.state==='match')||choices[0];
    return chosen?[chosen]:[];
  };
  const images=tagsOf(s,'images');
  const supplements=images.filter(t=>['seller_item_photo','release_reference','listing_image','work_reference'].includes(t.dimension));
  // Supplemented photos supersede an empty image field in the original export.
  const imageTags=supplements.length?[...images.filter(t=>t.dimension==='platform_tier'),...supplements]:images;
  const conditionTags=tagsOf(s,'condition').filter(t=>!['media_raw','sleeve_raw','new'].includes(t.dimension));
  const costs=tagsOf(s,'cost');
  const warehouseTags=costs.filter(t=>t.dimension==='lowest_path');
  const groups=[['name','名称',comparison('work','title')],['artist','艺人',comparison('work','artist')],['year','年代',comparison('version','year')],
    ['country','发行地区',comparison('version','country')],['medium','介质',comparison('version','medium')],
    ['release_id','Release ID',comparison('version','release_id')],['barcode','Barcode',comparison('version','barcode')],
    ['catalog_number','Catno',comparison('version','catalog_number')],['label','厂牌',comparison('version','label')],['obi','侧标',[obiCardTag(s)]],
    ['images','图片',imageTags],['condition','品相',conditionTags],['warehouse','仓库',warehouseTags]];
  return '<dl class="card-tag-groups" aria-label="货源关键标签">'+groups.map(([key,name,tags])=>'<div class="card-tag-group" data-tag-group="'+key+'"><dt>'+name+'</dt><dd class="tag-strip">'+(tags.length?tags.map(t=>{
    const view={};
    // The adjacent field name supplies context; full wording stays in details and accessible labels.
    if(compact&&['name','artist','year','country','medium','release_id','barcode','catalog_number','label'].includes(key)){
      const status=t.label.match(/^(?:作品名称|艺人|版本年代|发行地区|介质|Release ID|Barcode|Catno|厂牌)\s*(一致|不一致|缺失|待确认)$/);
      if(status)view.label=status[1];
    }
    if(t.module==='images'&&['release_reference','work_reference'].includes(t.dimension))view.label=t.label+' · 非卖家商品图';
    if(t.module==='condition'&&['media','sleeve'].includes(t.dimension)&&t.state==='pass'&&t.observed)view.label=(t.dimension==='media'?'盘面':'封套')+'·'+t.observed;
    if(t.module==='cost'&&t.dimension==='lowest_path'&&t.observed&&t.effect==='info')view.tone='good';
    return tagPill(t,view);
  }).join(''):'<span class="pill">未提供</span>')+'</dd></div>').join('')+'</dl>';
}
function tagDetails(t) {
  const values=(t.target!==null?'<span>目标：'+escape(tagValue(t.target,t))+'</span>':'')+(t.observed!==null?'<span>货源：'+escape(tagValue(t.observed,t))+'</span>':'');
  const sourceNames={source:'原JSON货源',target:'原JSON目标',supplement:'补充图片记录'};
  return '<details class="tag-proof"><summary>'+tagPill(t)+'<span class="tag-values">'+values+'</span></summary><div class="tag-proof-body"><p>'+escape(t.reason||'按该字段已有判断生成。')+'</p><p>影响：'+({info:'信息展示',review:'需人工确认',exclude:'排除依据',rank:'同到仓成本时先比较图片九档，再比较卖家评分'}[t.effect])+'</p><ul>'+t.evidence.map(e=>'<li><code>'+escape(sourceNames[e.scope]+' · '+e.field)+'</code><pre>'+escape(tagValue(e.value))+'</pre></li>').join('')+'</ul></div></details>';
}
function labelModules(s) {
  const groups=data.tag_groups;
  return '<section class="label-modules" aria-label="货源判断标签"><div class="label-modules-heading"><h3>逐字段判断</h3><span>展开标签查看原始依据</span></div>'+Object.entries(groups).filter(([key])=>key!=='decision'&&key!=='images'&&key!=='cost').map(([key,name])=>{
    const tags=tagsOf(s,key);if(!tags.length)return '';
    const issues=tags.filter(t=>t.effect!=='info').length;
    return '<details class="tag-module" '+(['work','version'].includes(key)?'open':'')+'><summary>'+escape(name)+'<span>'+tags.length+' 项'+(issues?' · '+issues+' 项需处理':'')+'</span></summary><div class="tag-module-body">'+tags.map(tagDetails).join('')+'</div></details>';
  }).join('')+'<p class="tag-basis">标签来自同一次规则计算；“未提供”不等于“不一致”。库存时间以本次回放时间为参照。</p></section>';
}
function tagFilterOptions(r) {
  const groups=data.tag_groups, options=new Map();
  for(const s of r.sources)for(const t of tagsOf(s))if(t.module!=='decision')options.set(JSON.stringify([t.code,t.label]),t);
  return '<option value="all">全部标签</option>'+Object.entries(groups).filter(([m])=>m!=='decision').map(([m,name])=>'<optgroup label="'+escape(name)+'">'+[...options].filter(([,t])=>t.module===m).map(([key,t])=>'<option value="'+escape(key)+'">'+escape(t.label)+'</option>').join('')+'</optgroup>').join('');
}
function matchesTagFilter(s) {if(state.tag==='all')return true;return tagsOf(s).some(t=>JSON.stringify([t.code,t.label])===state.tag);}
