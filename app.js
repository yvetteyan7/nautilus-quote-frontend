'use strict';
// Assets work at / or under a partner's subdirectory.
const appBase = new URL('.', document.currentScript.src);
const appURL = path => new URL(path, appBase).href;
const $ = (selector, scope = document) => scope.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash = n => n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : '¥' + Number(n).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
const text = (value, fallback = '未提供') => value === null || value === undefined || value === '' ? fallback : String(value);
const safeURL = value => {try {const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : '#';} catch {return '#';}};
const date = value => {if (!value) return '未提供';const d = new Date(value);return Number.isNaN(d.valueOf()) ? '未提供' : d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});};
const condition = value => {if (!value) return '未提供';return String(value).replace('Near Mint (NM or M-)','NM').replace('Very Good Plus (VG+)','VG+').replace('Mint (M)','M').replace('Very Good (VG)','VG');};
const platform = s => ({'EBAYUKUS':'eBay','YAHOOJAPAN':'Yahoo拍卖','DSUS':'Discogs','MERC':'Mercari','AMJP':'Amazon JP','DISKUNION':'Diskunion'}[s.platform_code] || s.platform);
const releaseMeta = r => [r.basic.year,r.basic.country].filter(Boolean).join(' · ') || '目标年份 / 地区未提供';
const entryLabel = r => r.entry_label ? ' · '+escape(r.entry_label) : '';
let data,pricingContext,selectionSequence=0,infoSequence=0;
let activeResultID='', activeRequestID='', activeResult=null, records=new Map();
const quoteData={
  peek(path){return records.get(path);},
  async load(path){if(!records.has(path))throw new Error('结果 JSON 缺少该记录');return records.get(path);}
};
async function loadPricingContext(){
  if(pricingContext)return pricingContext;
  const context=await quoteData.load(data.pricing_context_url);
  pricingContext=context;return context;
}
let selectedUserId=null,quoteUser={},quoteProfile=null;
try {selectedUserId=localStorage.getItem('nautilus-static-user-v1');} catch {}
function setQuoteUser(id){
  if(!(pricingContext.userProfiles||[]).length&&data.releases.every(r=>r.import_context?.hide_pricing_controls)){
    quoteProfile=null;selectedUserId=null;quoteUser={};return;
  }
  quoteProfile=QuoteUsers.forRelease(pricingContext,release(),id);
  selectedUserId=quoteProfile.id;quoteUser=QuoteUsers.input(quoteProfile);
}
let drafts = {};
try {drafts = JSON.parse(localStorage.getItem('nautilus-static-quotes-v1') || '{}');} catch {drafts = {};}
const state = {release:'3614513',source:null,route:null,cards:{},quoteTab:'reason',reasonPage:0,platformSelection:null};
let modalImages = [], modalIndex = 0, modalTitle = '', toastTimer;
function release() {return data?.releases.find(r => r.id === state.release);}
function source() {return release()?.sources?.find(s => s.id === state.source) || release()?.sources?.[0];}
function draftKey(s=source()) {return JSON.stringify([activeResultID,selectedUserId,state.release,s.id]);}
function draft(s=source()) {return drafts[draftKey(s)]||{};}
function routes() {return source()?.ranking?.estimated_cost?.routes || [];}
function route() {return routes()[state.route] || null;}
function currentCost() {return route()?.total_cost_cny ?? null;}
function bestRoute(s) {return s.ranking?.estimated_cost?.selected_route || null;}
function rankedCost(s) {return bestRoute(s)?.total_cost_cny ?? null;}
const quotePricingRule=QuotePricing.VERSION+'/'+StrategyQuote.VERSION+'/'+QuoteUsers.VERSION;
function pricingResult(s=source()) {
  return StrategyQuote.evaluate(release(),s,pricingContext,quoteUser,
    pricingContext.evaluatedAt||new Date().toISOString(),s.id===state.source?route():null);
}
function pricingFingerprint(s) {
  return StrategyQuote.fingerprint(release(),s,pricingContext,quoteUser,s.id===state.source?route():null);
}
function suggestedQuote(s) {
  return pricingResult(s).quoteCny;
}
function quoteInputValue(s) {
  const saved=draft(s);
  // Apply the new pricing basis without deleting older saved quotes or notes.
  if(saved?.pricing_rule===quotePricingRule&&saved.pricing_fingerprint===pricingFingerprint(s)&&
    (saved.price===null||Number.isFinite(saved.price)))return saved.price===null?'':Number(saved.price).toFixed(2);
  return suggestedQuote(s)?.toFixed(2)??'';
}
function quoteReason(r,price) {
  const result=pricingResult();
  if(result.quoteCny!==null&&(!Number.isFinite(price)||price<=0))return '填写有效报价后显示报价理由。';
  return returnedQuoteText('reason',price)??QuotePricing.explain(result,price);
}
function returnedQuoteText(key,price){
  if(!release().import_context?.result_snapshot)return null;
  const stored=source().quote_pricing,value=stored?.[key];
  if(typeof value!=='string')return null;
  const changed=Number.isFinite(price)&&Number.isFinite(stored.result.quoteCny)&&Math.abs(price-stored.result.quoteCny)>=.005;
  return value+(changed?'\n已人工改价，机器建议仍为 '+cash(stored.result.quoteCny)+'；以上解释服务器定价依据。':'');
}

function warehouseName(code) {return ({gb:'英国',uk:'英国',us:'美国',jp:'日本',cn:'中国'}[String(code).toLowerCase()] || text(code));}
function chooseRoute() {
  const available=routes(), preferred=bestRoute(source())?.route_id;
  const i=available.findIndex(r=>r.route_id===preferred);
  state.route=i>=0?i:Math.max(0,available.findIndex(r=>r.calculation_complete));
}
function filteredSources() {
  return SourcePlatforms.ranked(release().sources,state.platformSelection);
}
function platformFilterHTML(r) {
  return '<section class="platform-filter" aria-labelledby="platform-filter-title"><header><h3 id="platform-filter-title">平台筛选</h3><label><input type="checkbox" id="platform-all" aria-label="全选平台">全选</label></header><table aria-label="各平台货源数量"><tbody>'+SourcePlatforms.options(r.sources).map(p=>
    '<tr class="'+(p.count?'':'platform-empty')+'"><td><label><input type="checkbox" data-platform-code="'+escape(p.code)+'"><span>'+escape(p.name)+'</span></label></td><td>'+p.count+'</td></tr>').join('')+'</tbody></table></section>';
}
function syncPlatformFilter() {
  const inputs=[...document.querySelectorAll('[data-platform-code]')];
  inputs.forEach(input=>{input.checked=state.platformSelection===null||state.platformSelection.includes(input.dataset.platformCode);});
  const count=inputs.filter(input=>input.checked).length,all=$('#platform-all');
  all.checked=count===inputs.length;all.indeterminate=count>0&&count<inputs.length;
}
function setPlatformSelection(selection) {
  cancelQuoteMaterialDownload();
  state.platformSelection=selection;
  syncPlatformFilter();
  const visible=filteredSources(),previous=state.source;
  if(!visible.some(s=>s.id===state.source)){
    state.source=visible[0]?.id||null;state.route=null;state.reasonPage=0;
    if(state.source)chooseRoute();
  }
  renderSources();
  // Keep unsaved quote inputs and focus intact while their source is still visible.
  if(previous!==state.source){rankingSelectionSequence++;renderSelection();}
}
function bindPlatformFilter() {
  syncPlatformFilter();
  $('#platform-all').addEventListener('change',event=>setPlatformSelection(event.target.checked?null:[]));
  document.querySelectorAll('[data-platform-code]').forEach(input=>input.addEventListener('change',()=>{
    const inputs=[...document.querySelectorAll('[data-platform-code]')],selected=inputs.filter(input=>input.checked).map(input=>input.dataset.platformCode);
    setPlatformSelection(selected.length===inputs.length?null:selected);
  }));
}
function matchPill(s) {return versionCardTags(s);}
function eligibilityPill(s) {return tagsOf(s,'decision').filter(t=>t.label!=='待核实候选').map(tagPill).join('');}
function pendingText(s) {return attentionText(s);}
function isReference(s) {return ['release_reference','work_reference'].includes(s.images[0]?.kind);}
function imageLabel(s,index=0) {return ({release_reference:'版本参考图',work_reference:'作品参考图（版次未核实，非卖家实拍）',seller_item_photo:'卖家商品图',listing_image:'货源页面图（类型未确认）'}[s.images[index]?.kind]||'货源图片（类型未确认）');}
function targetReferenceImages(r) {
  const images=r.reference_images?.length?r.reference_images:(r.cover?[r.cover]:[]);
  const seen=new Set();
  return images.filter(image=>{
    if(!image?.local||seen.has(image.local))return false;
    seen.add(image.local);return true;
  });
}
function targetPhotoLabel(r,image) {
  return image.kind==='work_reference'?'Discogs 作品参考图（版次未核实）':image.kind==='source_export_image'?'货源图片':'Discogs Release #'+r.id+' 样图';
}
function targetGallery(r) {
  const images=targetReferenceImages(r);
  if(!images.length)return '';
  return '<div class="target-gallery" role="group" aria-label="目标心愿参考图片，共 '+images.length+' 张">'+images.map((image,index)=>{
    const label=targetPhotoLabel(r,image),position='第 '+(index+1)+' 张，共 '+images.length+' 张';
    return '<button type="button" class="target-photo" data-target-photo="'+escape(r.id)+'" data-target-index="'+index+'" title="'+escape(label)+' · '+position+'" aria-label="查看 '+escape(r.basic.title)+' 的'+escape(label)+'，'+position+'"><img src="'+escape(appURL(image.local))+'" alt="'+escape(r.basic.title)+' · '+escape(label)+' · '+(index+1)+'" width="60" height="60" loading="lazy" decoding="async"></button>';
  }).join('')+'</div>';
}
function photo(s,index=0,css='photo-btn',more=0) {
  const im=s.images[index];
  if(!im)return '<span class="no-photo">'+(s.photo_audit?.status==='no_item_photos_shown'?'未展示<br>卖家实拍':'暂无图片')+'</span>';
  const count=more>0?'+'+more:css==='photo-btn'&&s.images.length>1?s.images.length:null;
  return '<button class="'+css+'" data-photo="'+escape(s.id)+'" data-index="'+index+'" aria-label="查看 '+escape(s.title)+' 的第 '+(index+1)+' 张图片（共 '+s.images.length+' 张）"><img src="'+escape(appURL(im.local))+'" alt="'+escape(s.title)+' · '+escape(imageLabel(s,index))+'" loading="lazy" decoding="async">'+(count!==null?'<span class="photo-count">'+count+'</span>':'')+'</button>';
}
function sourcePhotos(s) {
  if(!s.images.length)return '<div class="rank-photos">'+photo(s)+'</div>';
  return '<div class="rank-photos">'+s.images.slice(0,4).map((_,index)=>photo(s,index,'photo-btn tiled-photo',index===3?s.images.length-4:0)).join('')+'</div>';
}
function notify(message) {clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function persist() {try {localStorage.setItem('nautilus-static-quotes-v1',JSON.stringify(drafts));return true;} catch {notify('报价保存失败，请检查浏览器存储空间。');return false;}}
function bindImages(scope=document) {
  scope.querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{img.parentElement.classList.add('row-image-failed');});});
  scope.querySelectorAll('[data-target-photo]').forEach(button=>button.addEventListener('click',()=>{
    const r=release();
    if(String(r.id)!==button.dataset.targetPhoto)return;
    const images=targetReferenceImages(r),index=Number(button.dataset.targetIndex||0);
    if(!Number.isInteger(index)||!images[index])return;
    modalImages=images;modalIndex=index;
    modalTitle='目标心愿 · '+targetPhotoLabel(r,images[index])+' · '+r.basic.title;
    renderModal();$('#image-viewer').showModal();
  }));
  scope.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
    const s=release().sources.find(s=>s.id===button.dataset.photo);
    if(s)openImages(s,Number(button.dataset.index));
  }));
}
function wishRequestedAt(value) {
  if(typeof value!=='string'||!value.trim())return '未提供';
  // Never interpret a timestamp with no zone as the viewer's local time.
  if(!/(?:Z|[+-]\d\d:\d\d)$/i.test(value))return value+'（时区未提供）';
  const instant=new Date(value);
  if(!Number.isFinite(instant.getTime()))return '未提供';
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant);
}
function wishTaskHTML(r) {
  const context=r.wish_context||{},payment=context.payment_history||{},stats=context.statistics||{},basic=r.basic||{};
  const requirements=r.requirements||{},demand=requirements.demand_raw||{};
  const remark=typeof requirements.remark==='string'?requirements.remark:'';
  const version=requirements.version_requirement||({0:'只要该版本',1:'接受其他版本'}[demand.version])||'未明确';
  const obiValues=[requirements.obi_requirement_raw,demand.jpobi].filter(value=>value!==null&&value!==undefined);
  const obi=!r.requirements?'未提供':obiValues.some(value=>value!==1)?'待确认':obiValues.includes(1)?'需要侧标':'未要求侧标';
  const number=value=>typeof value==='number'&&Number.isFinite(value);
  const money=value=>number(value)?new Intl.NumberFormat('zh-CN',{useGrouping:false,maximumFractionDigits:2}).format(value)+'元':'未提供';
  const range=number(payment.lowest_cny)||number(payment.highest_cny)?money(payment.lowest_cny)+'-'+money(payment.highest_cny):'未提供';
  const count=value=>Number.isInteger(value)&&value>=0?String(value):'—';
  const percent=value=>number(value)&&value>=0&&value<=1?new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:2}).format(value):'未提供';
  const title=context.work_title||basic.title||'作品未提供';
  const cover=r.cover?.local?'<img src="'+escape(appURL(r.cover.local))+'" alt="'+escape(title)+' 封面" loading="lazy" decoding="async">':'<span>暂无封面</span>';
  const avatar=r.user_avatar?.local?'<img src="'+escape(appURL(r.user_avatar.local))+'" alt="" loading="lazy" decoding="async">':'';
  const artist=r.artist||(basic.artists||[]).map(a=>a.name).filter(Boolean).join(', ')||'艺人未提供';
  const year=basic.year&&String(basic.year)!=='9999'?String(basic.year):'--';
  return '<button class="task '+(r.id===state.release?'selected':'')+'" data-release="'+escape(r.id)+'" aria-pressed="'+(r.id===state.release)+'" title="'+escape(title)+'">'+
    '<span class="task-columns"><span class="task-work">'+
      '<span class="task-requested" title="申请心愿时间">'+escape(wishRequestedAt(context.requested_at))+'</span>'+
      '<span class="task-work-main"><span class="task-work-cover">'+cover+'</span><span class="task-work-info">'+
        '<span class="task-title">'+escape(title)+'</span><span class="task-artist">'+escape(artist)+'</span>'+
        '<span class="task-medium">'+escape(basic.medium||'介质未提供')+'</span><span class="task-edition">'+escape(year+' · '+(basic.country||'地区未提供'))+'</span></span></span>'+
      '<span class="task-preferences"><span>'+escape(version)+'</span><span>'+escape(obi)+'</span></span>'+
      (remark.trim()?'<span class="task-remark task-remark-text">'+escape(remark)+'</span>':'')+
    '</span><span class="task-user">'+
      '<span class="task-user-main"><span class="task-user-avatar">'+avatar+'</span><span class="task-user-identity">'+
        '<span class="task-nickname">'+escape(context.nickname||'昵称未提供')+'</span><strong class="task-payment-range">'+escape(range)+'</strong></span></span>'+
      '<span class="task-user-metrics"><span>心/供/支：<strong>'+[stats.totalwant,stats.supplytotal,stats.paytotal].map(count).join('/')+'</strong></span>'+
        '<span>支付比率 <strong>'+percent(stats.payrate)+'</strong></span><span>毛利 <strong>'+percent(stats.priceratio)+'</strong></span></span>'+
      '<span class="task-login-dates"><span>首次：'+escape(wishRequestedAt(context.first_login_at))+'</span><span>最近：'+escape(wishRequestedAt(context.last_login_at))+'</span></span>'+
    '</span></span>'+
    '</button>';
}
function renderTasks() {
  $('#task-count').textContent=data.releases.length;
  $('#task-list').innerHTML=data.releases.map(wishTaskHTML).join('');
  bindImages($('#task-list'));
  $('#task-list').querySelectorAll('[data-release]').forEach(b=>b.addEventListener('click',()=>selectRelease(b.dataset.release)));
}
async function selectRelease(id,snapshot=null) {
  const entry=data.releases.find(r=>r.id===id);if(!entry)return;
  cancelQuoteMaterialDownload();
  const sequence=++selectionSequence;
  state.release=id;state.source=null;state.cards={};state.reasonPage=0;state.platformSelection=null;
  renderTasks();
  $('#detail').innerHTML='<section class="wish-loading"><h2>'+escape(entry.basic.title)+'</h2><p role="status">正在加载当前心愿货源…</p></section>';
  $('#detail').setAttribute('aria-busy','true');
  try {
    const [loaded]=await Promise.all([entry.sources?entry:quoteData.load(entry.data_url),loadPricingContext()]);
    if(loaded.id!==id||!Array.isArray(loaded.sources))throw new Error('货源数据与心愿不一致');
    if(sequence!==selectionSequence)return;
    data.releases[data.releases.findIndex(r=>r.id===id)]={...entry,...loaded};
    setQuoteUser(selectedUserId);
    $('#detail').setAttribute('aria-busy','false');
    if(!snapshot||!restoreWorkbench(snapshot)){
      state.source=filteredSources()[0]?.id||null;
      if(state.source)chooseRoute();
      renderDetail();
    }
    $('#export-selection').disabled=!source();
    return true;
  } catch(error) {
    if(sequence!==selectionSequence)return;
    $('#detail').setAttribute('aria-busy','false');
    $('#detail').innerHTML='<section class="wish-loading"><h2>'+escape(entry.basic.title)+'</h2><p role="alert">'+escape(error.message)+'</p><button id="retry-wish">重新加载</button></section>';
    $('#retry-wish').addEventListener('click',()=>selectRelease(id,snapshot));
    return false;
  }
}
function renderWishUser() {return '';}
function targetReleaseLink(r) {
  const id=String(r.basic?.release_id??'').trim();
  return /^[1-9]\d*$/.test(id)?'<a class="quiet-button" id="discogs-target-release" href="https://www.discogs.com/release/'+id+'" target="_blank" rel="noopener noreferrer" title="Discogs Release #'+id+'">Discogs 原始版本 ↗</a>':'';
}
function targetSalesHistoryPreview(r) {
  const sales=r.sales_history;
  return '<div class="target-fact target-sales-history" data-target-field="sales_history"><dt>历史成交价</dt><dd>'+[
    ['最低',sales?.lowest_cny],['中位',sales?.median_cny],['最高',sales?.highest_cny]
  ].map(([label,value])=>'<span class="pill target-value">'+label+' <b>'+cash(value)+'</b></span>').join('')+
    '<span class="history-example">'+(sales?.is_example?'示例 · 人民币':sales?'人民币':'未提供')+'</span></dd></div>';
}
function targetFactTags(r) {
  const basic=r.basic||{},ids=r.identifiers||{},labels=ids.labels||[];
  const values=items=>[...new Set(items.flat().filter(v=>typeof v==='string'||typeof v==='number').map(v=>String(v).trim()).filter(Boolean))];
  const artists=values((basic.artists||[]).map(a=>a.name));
  const barcodes=values([ids.barcode]);
  const catnos=values(labels.map(label=>label.catno));
  const medium=values([basic.medium,...(basic.formats||[]).map(format=>format.text)]);
  const year=Number(basic.year);
  const fields=[
    ['artist','艺人',artists.length?artists:values([r.artist])],
    ['year','年代',Number.isInteger(year)&&year>0&&year!==9999?[String(year)]:[]],
    ['country','发行地区',values([basic.country])],
    ['medium','介质',medium.length?[medium.join(' · ')]:[]],
    ['release_id','Release ID',values([basic.release_id])],
    ['barcode','Barcode',barcodes.length?barcodes:values((ids.identifiers||[]).filter(i=>String(i.type).toLowerCase()==='barcode').map(i=>i.value))],
    // Label catalogue numbers preserve the original variants; ids.catno can be a search normalization.
    ['catno','Catno',catnos.length?catnos:values([ids.catno])],
    ['labels','厂牌',values(labels.map(label=>label.name))]
  ];
  return '<dl class="target-facts" aria-label="目标心愿版本信息">'+fields.map(([key,label,items])=>
    '<div class="target-fact" data-target-field="'+key+'"><dt>'+label+'</dt><dd>'+(
      items.length?items.map(value=>'<span class="pill target-value" title="'+escape(value)+'">'+escape(value)+'</span>').join(''):'<span class="pill target-value missing">未提供</span>'
    )+'</dd></div>').join('')+targetSalesHistoryPreview(r)+'</dl>';
}
function renderDetail() {
  const r=release();
  $('#detail').innerHTML='<section class="sourcing-column"><div class="release-intro"><section class="target"><div class="target-identity"><div class="target-copy"><div class="target-heading"><h2 class="target-title" title="'+escape(r.basic.title)+'">'+escape(r.basic.title)+'</h2></div><div class="target-tags"><span class="'+(['接受其他版本','只要该版本'].includes(r.requirements.version_requirement)?'version-requirement':'')+'">'+escape(text(r.requirements.version_requirement,'版本接受范围未提供'))+'</span></div><div class="target-actions">'+targetReleaseLink(r)+'</div></div></div>'+targetFactTags(r)+targetGallery(r)+'</section></div><section class="ranking-summary"><h3>优先推荐的货源</h3><p>共 '+r.sources.length+' 条 · 可推荐 '+r.rerank.summary.eligible+' · 待确认 '+r.rerank.summary.manual_review+' · 排除 '+r.rerank.summary.excluded+'</p></section><div id="source-table" role="region" aria-label="货源列表" tabindex="0"></div></section><aside class="customer-column">'+renderWishUser()+'<div id="selection-panel"></div></aside>';
  if(isUnified(r)){
    $('.ranking-summary h3').textContent='货源候选排序';
    $('.ranking-summary p').textContent='共 '+r.sources.length+' 条 · 满足匹配 '+r.rerank.summary.eligible+' · 待核实 '+r.rerank.summary.manual_review+' · 排除 '+r.rerank.summary.excluded;
  }
  $('.release-intro').insertAdjacentHTML('afterend',platformFilterHTML(r));
  bindPlatformFilter();renderSources();renderSelection();bindImages($('.target'));
}
function imageAttribution(s) {return (s.display_tags||[]).map(t=>t.label).join(' · ')||(s.images.length?'货源图片 · 类型未确认':'货源未提供图片');}
function cardState(s) {
  const view=state.cards[s.id]||(state.cards[s.id]={flipped:false,tab:'product',textPage:0});
  if(!['product','original'].includes(view.tab))view.tab='product';
  return view;
}
function compactTagGroups(s) {
  const holder=document.createElement('div');holder.innerHTML=cardTagGroups(s,{compact:true});
  for(const group of holder.querySelectorAll('.card-tag-group')){
    const pills=[...group.querySelectorAll('.operator-tag')];
    if(pills.length>2){pills.slice(2).forEach(p=>p.remove());const more=document.createElement('button');more.className='tag-more';more.dataset.tagGroupInfo=group.dataset.tagGroup==='warehouse'?'cost':group.dataset.tagGroup==='images'?'images':group.dataset.tagGroup;more.dataset.source=s.id;more.textContent='+'+(pills.length-2);more.title='查看全部'+group.querySelector('dt').textContent+'标签';group.querySelector('dd').append(more);}
  }
  return holder.innerHTML;
}
function originalProductLink(s) {
  const href=safeURL(s.url);
  if(href==='#')return '<span class="source-link-unavailable">原商品链接未提供</span>';
  return '<a class="source-link" href="'+escape(href)+'" target="_blank" rel="noopener noreferrer" aria-label="打开 '+escape(platform(s))+' 商品 '+escape(s.product_id)+' 的原始页面（新标签页）">原始商品 ↗</a>';
}
function platformMark(s) {
  const file={EBAYUKUS:'ebay.svg',YAHOOJAPAN:'yahoo.png',DSUS:'discogs.svg',MERC:'mercari.png',AMJP:'amazon.svg',DISKUNION:'diskunion.png'}[s.platform_code];
  const name=platform(s)||s.platform_code||'未知平台';
  return file?'<img class="platform-logo" src="'+escape(appURL('assets/platforms/'+file))+'" alt="'+escape(name)+'" title="'+escape(name)+'" width="42" height="24" decoding="async">':'<span class="platform-logo-fallback">'+escape(name)+'</span>';
}
function topCard(s) {
  const q=s.ranking,selected=state.source===s.id,excluded=q.eligibility==='excluded';
  return '<article class="rank-card '+(selected?'selected ':'')+(excluded?'excluded-card':'')+'" data-ranked-source="'+escape(s.id)+'"><div class="rank-card-heading"><span class="rank-number">'+escape(isUnified(release())?q.candidate_rank??'—':q.rank??'—')+'</span>'+platformMark(s)+'<button class="rank-title" data-select="'+escape(s.id)+'" title="'+escape(s.title)+'">'+escape(s.title)+'</button>'+eligibilityPill(s)+'</div><div class="card-face">'+sourcePhotos(s)+'<div class="rank-cost">'+(isUnified(release())?unifiedCostDisplay(s,{showNotes:false}):'<span>到中国仓采购成本</span><strong>'+cash(rankedCost(s))+'</strong>')+'</div><div class="rank-evidence">'+compactTagGroups(s)+'</div><div class="rank-seller" title="'+escape(text(s.seller.nickname))+'">'+escape(text(s.seller.nickname))+'<span>'+(s.seller_rate_percent===null?'好评率未知':s.seller_rate_percent.toFixed(2)+'%')+' · '+escape(text(s.seller.rating_count_raw))+' 条评价</span></div>'+sellerComments(s)+'</div><div class="rank-actions">'+originalProductLink(s)+'<button class="'+(selected?'primary':'')+' rank-select" data-select="'+escape(s.id)+'">'+(selected?(release().import_context?.hide_pricing_controls?'已选 · 查看精排':'已选 · 正在报价'):excluded?'选择并查看':'选择此货源')+'</button></div></article>';
}
function refreshCard(s,selector){
  const old=$('[data-ranked-source="'+s.id+'"]',$('#source-table'));if(!old)return;
  const holder=document.createElement('div');holder.innerHTML=topCard(s);old.replaceWith(holder.firstElementChild);
  const fresh=$('[data-ranked-source="'+s.id+'"]',$('#source-table'));bindCardActions(fresh);bindImages(fresh);
  if(selector)$(selector,fresh)?.focus({preventScroll:true});
}
async function ensureCardDetail(s){
  if(quoteData.peek(s.detail_url))return;
  const releaseID=state.release,view=cardState(s);view.detailError=false;
  try {
    const detail=await quoteData.load(s.detail_url);
    if(detail.id!==s.id)throw new Error('货源详情不匹配');
  } catch(error) {view.detailError=true;}
  if(state.release===releaseID&&state.cards[s.id]===view&&view.flipped)refreshCard(s);
}
async function showSourceTags(s){
  openInfo('商品标签','<p role="status">正在加载详细依据…</p>');
  const sequence=infoSequence;
  try {
    const detail=await quoteData.load(s.detail_url);
    if(sequence===infoSequence&&$('#info-viewer').open){$('#info-content').innerHTML=cardTagGroups(detail);bindCardActions($('#info-content'));}
  }catch(error){
    if(sequence===infoSequence&&$('#info-viewer').open){
      $('#info-content').innerHTML='<p>详细依据加载失败。</p><button id="retry-evidence">重试</button>';
      $('#retry-evidence').addEventListener('click',()=>showSourceTags(s));
    }
  }
}
function bindCardActions(scope) {
  const find=id=>release().sources.find(s=>s.id===id);
  const cards=scope.matches('[data-ranked-source]')?[scope]:scope.querySelectorAll('[data-ranked-source]');
  cards.forEach(card=>{card.onclick=event=>{
    // Inner controls keep their own actions; dragging to copy text must not select a source.
    if(event.defaultPrevented||event.target.closest('button,a,input,select,textarea,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"])'))return;
    const selection=window.getSelection();
    if(selection&&!selection.isCollapsed&&card.contains(selection.anchorNode))return;
    const id=card.dataset.rankedSource;
    if(id!==state.source)selectSource(id);
  };});
  scope.querySelectorAll('[data-select]').forEach(b=>b.addEventListener('click',()=>selectSource(b.dataset.select)));
  scope.querySelectorAll('[data-seller-comments]').forEach(button=>button.addEventListener('click',()=>openSellerComments(find(button.dataset.sellerComments),button)));
  scope.querySelectorAll('[data-detail-retry]').forEach(b=>b.addEventListener('click',()=>{const s=find(b.dataset.detailRetry);ensureCardDetail(s);refreshCard(s);}));
  scope.querySelectorAll('[data-tag-group-info]').forEach(b=>b.addEventListener('click',()=>showSourceTags(find(b.dataset.source))));
  scope.querySelectorAll('[data-card-tab]').forEach(b=>b.addEventListener('click',()=>{const s=find(b.dataset.source);cardState(s).tab=b.dataset.cardTab;refreshCard(s,'[data-card-tab="'+b.dataset.cardTab+'"]');}));
  scope.querySelectorAll('[data-text-step]').forEach(b=>b.addEventListener('click',()=>{const s=find(b.dataset.source);cardState(s).textPage+=Number(b.dataset.textStep);refreshCard(s);}));
  scope.querySelectorAll('.source-link').forEach(a=>a.addEventListener('click',rememberWorkbench));
}
function renderSources() {
  const visible=filteredSources(),counts=visible.reduce((out,s)=>{out[s.ranking.eligibility]=(out[s.ranking.eligibility]||0)+1;return out;},{}),r=release();
  $('.ranking-summary p').textContent=(state.platformSelection===null?'共 '+visible.length+' 条':'筛选 '+visible.length+' / '+r.sources.length+' 条')+' · '+(isUnified(r)?'满足匹配 ':'可推荐 ')+(counts.eligible||0)+' · '+(isUnified(r)?'待核实 ':'待确认 ')+(counts.manual_review||0)+' · 排除 '+(counts.excluded||0);
  const scope=$('#source-table');
  scope.innerHTML=visible.length?'<div class="source-card-page">'+visible.map(topCard).join('')+'</div>':'<div class="empty" role="status">'+(state.platformSelection?.length===0?'请选择平台以查看货源。':state.platformSelection===null?'暂无货源。':'所选平台暂无货源。')+'</div>';
  // Only wish/filter changes rebuild the list. Native lazy images load near the viewport.
  scope.scrollTop=0;
  bindCardActions(scope);bindImages(scope);
}
function syncSelectedCards() {
  $('#source-table').querySelectorAll('[data-ranked-source]').forEach(card=>{
    const selected=card.dataset.rankedSource===state.source;
    card.classList.toggle('selected',selected);
    const button=$('.rank-select',card);
    button.classList.toggle('primary',selected);
    button.textContent=selected?(release().import_context?.hide_pricing_controls?'已选 · 查看精排':'已选 · 正在报价'):card.classList.contains('excluded-card')?'选择并查看':'选择此货源';
  });
}
function selectSource(id) {
  if(id===state.source)return;
  cancelQuoteMaterialDownload();
  state.source=id;state.reasonPage=0;chooseRoute();
  // Preserve card DOM, image loads, keyboard focus and the source scroll position.
  syncSelectedCards();renderSelection();
}
let quoteImageEdit=null,quoteImageTrigger=null,quoteMaterialJob=null;
function quoteSelectedImages(s=source()) {return QuoteImages.selected(s,draft(s).quote_image_urls);}
function quoteImagePreview(image,s,css='quote-image-preview') {
  return '<button type="button" class="'+css+'" data-photo="'+escape(s.id)+'" data-index="'+s.images.indexOf(image)+'" aria-label="放大第 '+(s.images.indexOf(image)+1)+' 张货源图片"><img src="'+escape(appURL(image.local))+'" alt="第 '+(s.images.indexOf(image)+1)+' 张货源图片" loading="lazy" decoding="async"></button>';
}
function quoteImagesHTML(s) {
  const all=QuoteImages.available(s),selected=quoteSelectedImages(s);
  return '<section class="quote-section quote-images-section" aria-labelledby="quote-images-title"><div class="quote-section-heading"><h4 id="quote-images-title">报价图片 <span class="quote-image-total">'+selected.length+' / '+all.length+'</span></h4><button type="button" class="quiet-button" id="edit-quote-images" '+(!all.length?'disabled':'')+'>编辑图片</button></div><div class="quote-image-strip">'+selected.map(image=>'<div class="quote-image-tile">'+quoteImagePreview(image,s)+'<button type="button" class="quote-image-remove" data-remove-quote-image="'+escape(image.url)+'" aria-label="移除第 '+(s.images.indexOf(image)+1)+' 张报价图片">×</button></div>').join('')+'</div>'+(!selected.length?'<p class="quote-images-empty">'+(all.length?'尚未选择图片':'本货源暂无可选图片')+'</p>':'')+'<button type="button" id="download-quote-materials" '+(!selected.length?'disabled':'')+'>下载图文素材</button><p id="quote-image-status" role="status"></p></section>';
}
function bindQuoteImages() {
  const scope=$('.quote-images-section');if(!scope)return;
  bindImages(scope);
  $('#edit-quote-images').addEventListener('click',event=>openQuoteImagePicker(event.currentTarget));
  scope.querySelectorAll('[data-remove-quote-image]').forEach(button=>button.addEventListener('click',()=>saveQuoteImageSelection(quoteSelectedImages().filter(image=>image.url!==button.dataset.removeQuoteImage).map(image=>image.url))));
  $('#download-quote-materials').addEventListener('click',downloadQuoteMaterials);
}
function saveQuoteImageSelection(urls) {
  cancelQuoteMaterialDownload();
  const s=source();captureDraft(false);
  drafts[draftKey(s)].quote_image_urls=QuoteImages.selected(s,urls).map(image=>image.url);
  const saved=persist();
  const scroll=$('#selection-panel').scrollTop;
  $('.quote-images-section').outerHTML=quoteImagesHTML(s);bindQuoteImages();
  $('#selection-panel').scrollTop=scroll;
  if(saved)$('#quote-image-status').textContent='图片选择已保存';
  return saved;
}
function openQuoteImagePicker(trigger) {
  const s=source(),images=QuoteImages.available(s);
  quoteImageTrigger=trigger;
  quoteImageEdit={sourceId:s.id,releaseId:state.release,images,urls:new Set(quoteSelectedImages(s).map(image=>image.url))};
  $('#quote-image-picker-grid').innerHTML=images.map((image,index)=>'<div class="quote-image-option">'+quoteImagePreview(image,s)+'<label><input type="checkbox" data-quote-image-choice="'+index+'"><span>第 '+(s.images.indexOf(image)+1)+' 张</span></label></div>').join('');
  bindImages($('#quote-image-picker-grid'));
  $('#quote-image-picker-grid').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
    const url=images[Number(input.dataset.quoteImageChoice)].url;
    if(input.checked)quoteImageEdit.urls.add(url);else quoteImageEdit.urls.delete(url);
    syncQuoteImagePicker();
  }));
  syncQuoteImagePicker();$('#quote-image-picker').showModal();
  $('#quote-image-picker-grid').scrollTop=0;$('#quote-image-picker-title').focus({preventScroll:true});
}
function syncQuoteImagePicker() {
  if(!quoteImageEdit)return;
  $('#quote-image-picker-grid').querySelectorAll('input').forEach(input=>{
    input.checked=quoteImageEdit.urls.has(quoteImageEdit.images[Number(input.dataset.quoteImageChoice)].url);
    input.closest('.quote-image-option').classList.toggle('selected',input.checked);
  });
  $('#quote-image-picker-count').textContent='已选 '+quoteImageEdit.urls.size+' / '+quoteImageEdit.images.length+' 张';
}
function cancelQuoteMaterialDownload() {
  if(!quoteMaterialJob)return;
  quoteMaterialJob.abort();quoteMaterialJob=null;
  if($('#download-quote-materials')){
    $('#download-quote-materials').disabled=!quoteSelectedImages().length;
    $('#quote-image-status').textContent='';
  }
}
async function downloadQuoteMaterials() {
  const s=source(),images=quoteSelectedImages(s),description=$('#quote-description').value;
  if(!images.length||quoteMaterialJob)return;
  const job=new AbortController();quoteMaterialJob=job;
  const button=$('#download-quote-materials'),status=$('#quote-image-status');button.disabled=true;
  const files=[];let size=0;
  try {
    // Capture this source's selection and copy before any asynchronous image requests.
    for(let index=0;index<images.length;index++){
      if(job.signal.aborted)return;
      status.textContent='正在准备原图 '+(index+1)+' / '+images.length+'…';
      const image=images[index];
      try {
        const response=await fetch(appURL(image.local),{signal:job.signal});
        const extension=QuoteImages.extensions[(response.headers.get('Content-Type')||'').split(';')[0].trim()];
        if(!response.ok)throw new Error('HTTP '+response.status);
        if(!extension)throw new Error('不支持的图片格式：'+(response.headers.get('Content-Type')||'未知'));
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(!bytes.length)throw new Error('图片为空');
        size+=bytes.length;if(size>128*1024*1024)throw new Error('素材超过128MB，请分批选择');
        files.push({name:String(index+1).padStart(2,'0')+'.'+extension,bytes});
      } catch(error) {
        if(job.signal.aborted)return;
        throw new Error('第 '+(s.images.indexOf(image)+1)+' 张原图下载失败：'+error.message+'。跨域图片需要允许 CORS，或配置同域图片代理。');
      }
    }
    if(description.trim())files.push({name:'报价说明.txt',bytes:new TextEncoder().encode(description)});
    if(job.signal.aborted)return;
    const blob=QuoteImages.zip(files),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=('报价素材-'+s.product_id).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')+'.zip';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent='已准备 '+images.length+' 张原图'+(description.trim()?'和报价说明':'')+'，请从下载文件发送。';
  } catch(error) {if(!job.signal.aborted)status.textContent=error.message;}
  finally {if(quoteMaterialJob===job){quoteMaterialJob=null;button.disabled=false;}}
}
$('#quote-image-picker-close').addEventListener('click',()=>$('#quote-image-picker').close());
$('#quote-image-picker-cancel').addEventListener('click',()=>$('#quote-image-picker').close());
$('#quote-image-picker').addEventListener('close',()=>{
  quoteImageEdit=null;$('#quote-image-picker-grid').innerHTML='';
  const trigger=quoteImageTrigger;quoteImageTrigger=null;
  if(trigger?.isConnected)trigger.focus({preventScroll:true});
  else $('#edit-quote-images')?.focus({preventScroll:true});
});
$('#quote-image-picker-apply').addEventListener('click',()=>{
  if(!quoteImageEdit||quoteImageEdit.sourceId!==state.source||quoteImageEdit.releaseId!==state.release)return;
  saveQuoteImageSelection([...quoteImageEdit.urls]);$('#quote-image-picker').close();
});
document.querySelectorAll('[data-image-choice]').forEach(button=>button.addEventListener('click',()=>{
  if(!quoteImageEdit)return;
  const images=button.dataset.imageChoice==='none'?[]:button.dataset.imageChoice==='default'?quoteImageEdit.images.slice(0,4):quoteImageEdit.images;
  quoteImageEdit.urls=new Set(images.map(image=>image.url));syncQuoteImagePicker();
}));
function renderSelection() {
  $('#export-selection').disabled=!state.source||!filteredSources().length;
  if(!filteredSources().length){$('#selection-panel').innerHTML='<div class="empty">暂无可报价货源</div>';return;}
  if(release().import_context?.hide_pricing_controls){renderRankingSelection();return;}
  const s=source(),result=pricingResult(),available=result.quoteCny!==null;
  $('#selection-panel').innerHTML=(isUnified(release())?unifiedSelection(s,release()):'')+'<section class="quote strategy-quote"><div class="quote-heading"><h3>用户定价</h3><p class="quote-route">'+escape(platform(s))+' · '+escape(s.product_id)+'</p></div><p class="bound-pricing-user">'+escape(quoteProfile.nickname)+' · '+(result.quoteCny===null?'暂不可报价':result.status==='ready'?'建议报价':'待核实试算价')+'</p><div class="quote-price"><span>¥</span><input id="quote-price" type="number" min="0.01" max="999999" step="any" inputmode="decimal" aria-label="报价金额（人民币）" aria-describedby="quote-message" placeholder="暂无法报价" '+(available?'':'disabled')+' value="'+escape(available?quoteInputValue(s):'')+'"><div class="quote-stepper"><button type="button" data-quote-step="1" aria-label="报价增加1元" title="增加1元">▴</button><button type="button" data-quote-step="-1" aria-label="报价减少1元" title="减少1元">▾</button></div></div><div class="machine-quote"><span>机器建议 <b>'+cash(result.quoteCny)+'</b></span><button class="quiet-button" id="reset-quote" '+(available?'':'disabled')+'>恢复机器价</button></div><div class="strategy-profit"><span>预计利润 <strong id="quote-profit">—</strong></span><span id="quote-markup"></span></div><div class="quote-sections"><section class="strategy-reason quote-section" aria-labelledby="pricing-reason-title"><div class="quote-section-heading"><h4 id="pricing-reason-title">定价理由</h4><span>内部参考</span></div><p id="quote-reason"></p><details class="pricing-full"><summary>完整定价依据</summary><p id="pricing-full-reason"></p></details></section>'+quoteImagesHTML(s)+'<section class="quote-description-section quote-section" aria-labelledby="quote-description-title"><div class="quote-section-heading"><h4 id="quote-description-title"><label for="quote-description">报价说明</label></h4><span>面向用户</span></div><textarea id="quote-description" rows="2" placeholder="本轮仅生成每个心愿前六条候选的报价说明，其余可人工填写。">'+escape(QuoteDescriptions.resolveSource(s,draft()))+'</textarea><button type="button" id="copy-customer-message">复制报价说明</button></section></div><p class="quote-message" id="quote-message" aria-live="polite"></p><button class="primary" id="save-draft">保存报价到本机</button></section>';
  $('#quote-price').addEventListener('input',()=>{captureDraft(false);updateQuote();});
  $('#quote-description').addEventListener('input',()=>{resizeQuoteDescription();captureDraft(false);updateQuote();});
  $('#quote-price').addEventListener('keydown',event=>{
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();stepQuotePrice(event.key==='ArrowUp'?1:-1);
    }
  });
  document.querySelectorAll('[data-quote-step]').forEach(button=>button.addEventListener('click',()=>stepQuotePrice(Number(button.dataset.quoteStep))));
  $('#reset-quote').addEventListener('click',()=>{const value=pricingResult().quoteCny;if(value===null)return;$('#quote-price').value=value.toFixed(2);captureDraft(false);updateQuote();});
  $('#save-draft').addEventListener('click',()=>{if(!updateQuote())return;if(captureDraft(true)){$('#quote-message').textContent='报价、图片及说明已保存到本机';notify('报价、图片及说明已保存到本机');}else{$('#quote-message').textContent='保存失败，请重试。';$('#quote-message').classList.add('error');}});
  $('#copy-customer-message').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#quote-description').value);notify('报价说明已复制');}catch{notify('复制失败，请手动选择说明框内文字复制');}});
  bindQuoteImages();updateQuote();resizeQuoteDescription();
}
let rankingSelectionSequence=0;
async function renderRankingSelection(){
  const sequence=++rankingSelectionSequence,s=source(),r=release();
  $('#selection-panel').innerHTML='<p role="status">正在加载采购成本…</p>';
  try{
    const detail=s.detail_url?await quoteData.load(s.detail_url):s;
    if(sequence!==rankingSelectionSequence||state.release!==r.id||state.source!==s.id)return;
    if(detail.id!==s.id)throw new Error('货源详情不匹配');
    $('#selection-panel').innerHTML=unifiedSelection(detail,r);
  }catch(error){
    if(sequence===rankingSelectionSequence)$('#selection-panel').innerHTML='<p>'+escape(error.message)+'</p>';
  }
}
function resizeQuoteDescription(){
  const field=$('#quote-description');if(!field)return;
  field.style.height='auto';field.style.height=Math.max(76,field.scrollHeight+2)+'px';
}
window.addEventListener('resize',resizeQuoteDescription);
function stepQuotePrice(direction) {
  const input=$('#quote-price'),price=input.valueAsNumber;
  if(input.disabled||!Number.isFinite(price))return;
  const next=(Math.round(price*100)+direction*100)/100;
  if(next<Number(input.min)||next>Number(input.max))return;
  input.value=next.toFixed(2);captureDraft(false);updateQuote();
}
function renderQuoteReason() {
  const result=pricingResult(),price=$('#quote-price').valueAsNumber;
  $('#quote-reason').textContent=returnedQuoteText('summary',price)??StrategyQuote.summary(result,price);
  $('#pricing-full-reason').textContent=returnedQuoteText('reason',price)??QuotePricing.explain(result,price);
  const validAmount=result.quoteCny!==null&&Number.isFinite(price)&&price>0;
  $('#quote-profit').textContent=validAmount?cash(price-result.costCny):'—';
  $('#quote-markup').textContent=validAmount?'成本加价 '+((price/result.costCny-1)*100).toFixed(1)+'%':'';
}
function openInfo(title,html) {infoSequence++;$('#info-title').textContent=title;$('#info-content').innerHTML=html;$('#info-viewer').showModal();}
let sellerCommentTrigger=null,sellerCommentBackdropDown=false;
let sellerCommentOriginal='',sellerCommentReadable='',sellerCommentRawMode=false;
function renderSellerComment() {
  $('#seller-comment-body').textContent=sellerCommentRawMode?sellerCommentOriginal:sellerCommentReadable;
  $('#seller-comment-mode').textContent=sellerCommentRawMode?'返回阅读模式':'查看原始文本';
  $('#seller-comment-mode').setAttribute('aria-pressed',String(sellerCommentRawMode));
  $('#seller-comment-body').scrollTop=0;
}
function isCommentBackdrop(event) {
  const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();
  return event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom);
}
function openSellerComments(s,trigger) {
  const raw=s?.condition?.original_condition?.comments;
  if(typeof raw!=='string'||!raw.trim())return;
  sellerCommentTrigger=trigger;
  sellerCommentOriginal=raw;sellerCommentReadable=sellerCommentReadText(raw);sellerCommentRawMode=false;
  $('#seller-comment-mode').hidden=sellerCommentReadable===raw;
  renderSellerComment();
  document.documentElement.classList.add('seller-comments-open');
  $('#seller-comment-viewer').showModal();
  $('#seller-comment-body').scrollTop=0;
  $('#seller-comment-title').focus({preventScroll:true});
}
// Same-tab links also work in previews that do not handle new-window requests.
// Store the return state on this history entry, without saving or sending a quote.
function rememberWorkbench() {
  const snapshot={release:state.release,source:state.source,
    platformSelection:state.platformSelection,
    sourceScrollTop:$('#source-table').scrollTop,sideScrollTop:$('#selection-panel').scrollTop,queueScrollTop:$('#task-list').scrollTop,cards:state.cards,quoteTab:state.quoteTab,reasonPage:state.reasonPage,drafts,pricingVersion:quotePricingRule,quoteUserId:selectedUserId,scrollY:window.scrollY,
    details:[...$('#detail').querySelectorAll('details')].map(d=>d.open)};
  history.replaceState({...history.state,quoteWorkbenchReturn:snapshot},'');
}
function restoreWorkbench(snapshot) {
  const r=data.releases.find(r=>r.id===snapshot?.release);
  if(!r||!r.sources.some(s=>s.id===snapshot.source))return false;
  Object.assign(state,{release:r.id,source:snapshot.source,cards:snapshot.cards||{},quoteTab:snapshot.quoteTab||'reason',reasonPage:snapshot.reasonPage||0,platformSelection:Array.isArray(snapshot.platformSelection)?snapshot.platformSelection:null});
  Object.assign(drafts,snapshot.drafts||{});
  if(snapshot.pricingVersion===quotePricingRule&&snapshot.quoteUserId)setQuoteUser(snapshot.quoteUserId);
  chooseRoute();renderTasks();renderDetail();
  $('#detail').querySelectorAll('details').forEach((d,i)=>{d.open=!!snapshot.details?.[i];});
  requestAnimationFrame(()=>{
    const list=$('#source-table');
    list.scrollTop=snapshot.sourceScrollTop||0;
    // Old history entries saved a page's first source rather than a scroll offset.
    if(snapshot.sourceScrollTop===undefined&&snapshot.pageSource){
      const card=[...list.querySelectorAll('[data-ranked-source]')].find(el=>el.dataset.rankedSource===snapshot.pageSource);
      if(card)list.scrollTop=card.getBoundingClientRect().top-list.getBoundingClientRect().top;
    }
    $('#selection-panel').scrollTop=snapshot.sideScrollTop||0;
    $('#task-list').scrollTop=snapshot.queueScrollTop||0;
    window.scrollTo(0,snapshot.scrollY||0);
  });
  clearReturnState();
  return true;
}
function clearReturnState() {
  if(!history.state?.quoteWorkbenchReturn)return;
  const next={...history.state};delete next.quoteWorkbenchReturn;history.replaceState(next,'');
}
window.addEventListener('pageshow',event=>{if(event.persisted)clearReturnState();});
function captureDraft(save) {
  const p=$('#quote-price').value,price=p===''?null:Number(p);
  drafts[draftKey()]={...draft(),quote_user_id:selectedUserId,quote_user_name:quoteProfile.nickname,release_id:state.release,source_id:source().product_id,platform:platform(source()),price,pricing_rule:quotePricingRule,pricing_fingerprint:pricingFingerprint(source()),pricing_assumptions:{...quoteUser},pricing_result:pricingResult(),route:state.route,route_id:route()?.route_id,cost_rule_version:source().ranking.estimated_cost.cost_rule_version,estimate_cost:currentCost(),quote_reason:quoteReason(release(),price),quote_description:$('#quote-description').value,quote_image_urls:quoteSelectedImages().map(image=>image.url),updated_at:new Date().toISOString()};
  if(save){const ok=persist();if(ok)window.dispatchEvent(new CustomEvent('nautilus:quote-saved',{detail:exportSelection()}));return ok;}
  return true;
}
function updateQuote() {
  const input=$('#quote-price');if(!input)return false;
  const result=pricingResult(),check=StrategyQuote.validation(result,input.valueAsNumber);
  renderQuoteReason();
  const valid=check.valid&&input.validity.valid;
  $('#save-draft').disabled=!valid;
  $('#copy-customer-message').disabled=!$('#quote-description').value.trim();
  $('#download-quote-materials').disabled=!quoteSelectedImages().length||!!quoteMaterialJob;
  document.querySelectorAll('[data-quote-step]').forEach(button=>{
    const next=(Math.round(input.valueAsNumber*100)+Number(button.dataset.quoteStep)*100)/100;
    button.disabled=input.disabled||!Number.isFinite(next)||next<Number(input.min)||next>Number(input.max);
  });
  $('#quote-message').classList.toggle('error',!valid&&result.quoteCny!==null);
  $('#quote-message').textContent=result.quoteCny===null?'':check.message;
  $('#reset-quote').disabled=result.quoteCny===null||input.valueAsNumber===result.quoteCny;
  return valid;
}
function openImages(s,index) {modalImages=s.images;modalIndex=index;modalTitle=platform(s)+' '+imageLabel(s,index)+' · '+s.title;renderModal();$('#image-viewer').showModal();}
function renderModal() {
  const im=modalImages[modalIndex];if(!im)return;
  $('#viewer-caption').textContent=modalTitle+' · '+(modalIndex+1)+' / '+modalImages.length;
  $('#viewer-img').hidden=false;$('#viewer-error').hidden=true;$('#viewer-img').src=appURL(im.local);
  $('#viewer-img').alt=modalTitle+' 第 '+(modalIndex+1)+' 张';$('#viewer-original').href=safeURL(im.url);
  $('#viewer-prev').disabled=modalIndex===0;$('#viewer-next').disabled=modalIndex>=modalImages.length-1;
}
$('#info-close').addEventListener('click',()=>$('#info-viewer').close());
$('#info-viewer').addEventListener('click',e=>{if(e.target===$('#info-viewer'))$('#info-viewer').close();});
$('#seller-comment-close').addEventListener('click',()=>$('#seller-comment-viewer').close());
$('#seller-comment-return').addEventListener('click',()=>$('#seller-comment-viewer').close());
$('#seller-comment-mode').addEventListener('click',()=>{sellerCommentRawMode=!sellerCommentRawMode;renderSellerComment();});
$('#seller-comment-viewer').addEventListener('pointerdown',event=>{sellerCommentBackdropDown=isCommentBackdrop(event);});
$('#seller-comment-viewer').addEventListener('click',event=>{
  if(sellerCommentBackdropDown&&isCommentBackdrop(event))event.currentTarget.close();
  sellerCommentBackdropDown=false;
});
$('#seller-comment-viewer').addEventListener('close',()=>{
  sellerCommentBackdropDown=false;
  document.documentElement.classList.remove('seller-comments-open');
  const trigger=sellerCommentTrigger;sellerCommentTrigger=null;
  if(trigger?.isConnected)trigger.focus({preventScroll:true});
  $('#seller-comment-body').textContent='';
  sellerCommentOriginal='';sellerCommentReadable='';
});
$('#viewer-close').addEventListener('click',()=>$('#image-viewer').close());
$('#viewer-prev').addEventListener('click',()=>{if(modalIndex>0){modalIndex--;renderModal();}});
$('#viewer-next').addEventListener('click',()=>{if(modalIndex<modalImages.length-1){modalIndex++;renderModal();}});
$('#viewer-img').addEventListener('error',()=>{$('#viewer-img').hidden=true;$('#viewer-error').hidden=false;});
$('#image-viewer').addEventListener('click',e=>{if(e.target===$('#image-viewer'))$('#image-viewer').close();});
document.addEventListener('keydown',e=>{if(!$('#image-viewer').open)return;if(e.key==='ArrowLeft'&&modalIndex>0){modalIndex--;renderModal();}if(e.key==='ArrowRight'&&modalIndex<modalImages.length-1){modalIndex++;renderModal();}});
// Public integration surface. No requests to the ranking/model API are made here.
let importSequence=0;
const config=window.NautilusQuoteConfig||{};
async function resultDigest(raw){
  if(globalThis.crypto?.subtle){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  }
  // HTTP-only deployments lack SubtleCrypto. This is a draft namespace, not a signature.
  let hash=2166136261;for(let i=0;i<raw.length;i++)hash=Math.imul(hash^raw.charCodeAt(i),16777619)>>>0;
  return 'draft-'+hash.toString(16)+'-'+raw.length;
}
function exportSelection(){
  if(!state.source||!release()||!filteredSources().some(s=>s.id===state.source))return null;
  const s=source();if(!s)return null;
  const saved=draft(s),input=$('#quote-price');
  const price=input?(input.value===''?null:input.valueAsNumber):(saved.price??s.quote_pricing.result.quoteCny);
  const valid=StrategyQuote.validation(s.quote_pricing.result,price);
  return {
    schema_version:'nautilus-quote-draft/1', result_id:activeResultID, request_sha256:activeRequestID,
    wish_id:release().wish_context.wish_id, user_profile_id:selectedUserId,
    release_id:state.release, source_id:s.id, platform_code:s.platform_code, product_id:s.product_id,
    original_rank:s.ranking.rank, candidate_rank:s.ranking.candidate_rank,
    quote_cny:Number.isFinite(price)?price:null, machine_quote_cny:s.quote_pricing.result.quoteCny,
    description:$('#quote-description')?.value??QuoteDescriptions.resolveSource(s,saved),
    image_urls:QuoteImages.selected(s,saved.quote_image_urls).map(image=>image.url),
    validation:valid, updated_at:new Date().toISOString()
  };
}
function saveJSON(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function reportImportError(error){
  $('#result-status').textContent='导入失败：'+error.message;
  $('#result-status').classList.add('error');
  notify(error.message);
  window.dispatchEvent(new CustomEvent('nautilus:error',{detail:{message:error.message}}));
}
async function loadResult(result,options={}){
  const sequence=++importSequence;
  const raw=JSON.stringify(result),id=await resultDigest(raw);
  const prepared=ResultAdapter.prepare(result,{baseURL:appBase.href,imageURL:options.imageURL||config.imageURL,resultID:id});
  if(sequence!==importSequence)throw new Error('本次导入已被更新的结果替代');
  cancelQuoteMaterialDownload();selectionSequence++;infoSequence++;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  activeResultID=id;activeRequestID=result.request_sha256;activeResult=JSON.parse(raw);
  records=prepared.records;data=prepared.index;pricingContext=null;quoteProfile=null;selectedUserId=null;
  clearReturnState();state.cards={};state.source=null;
  const requested=options.releaseId||new URLSearchParams(location.search).get('release');
  state.release=data.releases.some(r=>r.id===String(requested))?String(requested):data.releases[0]?.id;
  renderTasks();
  if(state.release){
    const rendered=await selectRelease(state.release);
    if(!rendered)throw new Error('结果无法渲染，请检查当前心愿提示');
  }
  else $('#detail').innerHTML='<div class="empty">本次结果暂无心愿。</div>';
  $('#result-status').textContent=(result.demo?'虚构演示 · ':'')+data.releases.length+' 个心愿 · '+data.totals.sources+' 条货源';
  $('#result-status').classList.remove('error');
  $('#export-selection').disabled=!source();
  const summary={resultID:id,releases:data.releases.length,sources:data.totals.sources};
  window.dispatchEvent(new CustomEvent('nautilus:loaded',{detail:summary}));
  return summary;
}
async function loadFromURL(value){
  const sequence=++importSequence,url=new URL(value,appBase);
  if(url.origin!==location.origin)throw new Error('结果 JSON 请通过己方同域接口提供；不要把精排服务密钥放到浏览器');
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('结果读取失败（HTTP '+response.status+'）');
  const result=await response.json();
  if(sequence!==importSequence)throw new Error('本次加载已被更新的结果替代');
  return loadResult(result);
}
window.NautilusQuote=Object.freeze({version:'1.0.0',loadResult,loadFromURL,getSelection:exportSelection,
  // ready means the DOM/API is ready, not that an automatic demo request has completed.
  ready:Promise.resolve(),
  getResult(){return activeResult?JSON.parse(JSON.stringify(activeResult)):null;}
});
$('#import-result').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>64*1024*1024)throw new Error('文件超过 64 MiB，请按任务拆分结果');
    await loadResult(JSON.parse(await file.text()));
  }catch(error){reportImportError(error);}finally{event.target.value='';}
});
$('#load-demo').addEventListener('click',()=>loadFromURL('./examples/demo-result.json').catch(reportImportError));
$('#export-selection').addEventListener('click',()=>{
  const selection=exportSelection();if(!selection)return;
  saveJSON(selection,'quote-draft-'+selection.release_id+'.json');
  notify('已导出人工报价草稿；尚未提交到业务系统');
});
window.dispatchEvent(new Event('nautilus:ready'));
if(config.autoLoad!==false&&new URLSearchParams(location.search).get('autoload')!=='0')loadFromURL(config.resultURL||'./examples/demo-result.json').catch(reportImportError);
else {$('#detail').innerHTML='<div class="empty">导入精排结果 JSON，或通过 NautilusQuote.loadResult(result) 加载。</div>';$('#result-status').textContent='等待导入';}
