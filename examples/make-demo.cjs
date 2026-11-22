// Entirely synthetic fixtures; never derived from a customer's exported JSON.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');fs.mkdirSync(path.join(root,'assets/demo'),{recursive:true});
for(const [key,bg,ink] of [['a','#dce4d9','#264c3d'],['b','#e8dceb','#594266']]){
  for(let i=1;i<=6;i++)fs.writeFileSync(path.join(root,`assets/demo/${key}-${i}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><rect width="480" height="480" rx="12" fill="${bg}"/><circle cx="240" cy="250" r="145" fill="${ink}"/><circle cx="240" cy="250" r="82" fill="none" stroke="${bg}" stroke-width="2"/><circle cx="240" cy="250" r="30" fill="${bg}"/><path d="M0 405L480 360V480H0Z" fill="${ink}" opacity=".15"/><text x="32" y="54" font-family="sans-serif" font-size="22" fill="${ink}">NAUTILUS / SYNTHETIC DEMO</text><text x="32" y="450" font-family="sans-serif" font-size="19" fill="${ink}">ALBUM ${key.toUpperCase()} — IMAGE ${i}</text></svg>`);
}
const image=(key,i,kind)=>({id:`demo-${key}-${i}`,url:`https://example.com/nautilus-demo/${key}-${i}.svg`,local:`/media/demo-${key}-${i}`,kind});
const tag=(module,dimension,label,observed,state='match',target=null)=>({code:[module,dimension,state].join('.'),module,dimension,label,observed,target,state,effect:'info',reason:'虚构演示数据，仅展示接口字段。',evidence:[]});
const platforms=[['EBAYUKUS','eBay'],['DSUS','Discogs'],['MERC','Mercari'],['YAHOOJAPAN','Yahoo'],['AMJP','Amazon JP'],['DISKUNION','Diskunion'],['EBAYUKUS','eBay']];
const profiles=[],bindings={};
function makeRelease(id,key,title,artist,total){
 const wishId=`DEMO-WISH-${key}`,profileId=`DEMO-PROFILE-${key}`;
 profiles.push({id:profileId,wishId,targetReleaseId:id,nickname:`示例用户 ${key.toUpperCase()}`,pricing:{priceRatio:.3,priceRatioStatus:'valid',pricingMode:'user-priceratio'},provenance:{source:'synthetic-demo'}});
 bindings[id]={profileId,wishId};
 const sources=Array.from({length:total},(_,idx)=>{
  const n=idx+1,[platform_code,platform]=platforms[idx%platforms.length],sid=`${id}:${platform_code}:DEMO-${n}`;
  const excluded=n===7,unpriced=key==='b'&&n===2,cost=unpriced?null:100+n*12.5,quote=excluded||unpriced?null:Math.round(cost*1.3*100)/100;
  const route=cost===null?null:{route_id:'gb-to-cn',warehouse_id:'gb',calculation_complete:true,usable_for_ranking:true,total_cost_cny:cost,components_cny:{sale:cost-25,tax:0,shipping:10},transfer_to_china_cny:15,notes:[]};
  const estimates={cost_rule_version:'demo-only',selected_route:route,routes:route?[route]:[],partial_quotes:unpriced?[{warehouse_id:'us',components_cny:{sale:80,tax:null,shipping:null},transfer_to_china_cny:20,total_cost_cny:null,usable_for_ranking:false,notes:['未提供运费']}]:[]};
  const dims=Object.fromEntries(Array.from({length:29},(_,i)=>[String(i+1).padStart(2,'0'),[]]));
  dims['04']=[{value:excluded?'Another Album':title,quote:excluded?'Another Album':title,path:'/synthetic/title'}];
  dims['05']=[{value:artist,quote:artist,path:'/synthetic/title'}];dims['13']=[{value:'CD',quote:'CD',path:'/synthetic/title'}];
  const status=excluded?'excluded':n===1?'eligible':'manual_review';
  const tags=[tag('work','title','作品名称 '+(excluded?'不一致':'一致'),excluded?'Another Album':title,excluded?'conflict':'match',title),tag('work','artist','艺人 一致',artist),tag('version','year','版本年代 '+(n===2?'缺失':'一致'),n===2?null:2001,n===2?'missing':'match'),tag('version','country','发行地区 一致','UK'),tag('version','medium','介质 一致','CD'),tag('version','release_id','Release ID 缺失',null,'missing'),tag('version','barcode','Barcode 缺失',null,'missing'),tag('version','catalog_number','Catno 一致','DEMO-001'),tag('version','label','厂牌 一致','Demo Records'),tag('condition','media','盘面 · Near Mint','Near Mint','pass'),tag('condition','sleeve','封套 · Very Good Plus','Very Good Plus','pass'),tag('cost','lowest_path',route?'英国仓 → 中国仓':'成本待核实',route?{cost_cny:cost}:null,'present'),tag('images','platform_tier','图片与平台优先级 '+(n===2?3:6),{tier:n===2?3:6,image_type:n===2?'none':'unknown'},'present'),tag('images','supplied',n===2?'未提供货源图片':'有货源图片',n===2?0:n===1?6:2,n===2?'missing':'present')];
  return {id:sid,order:n,platform,platform_code,product_id:`DEMO-${key}-${n}`,title:excluded?`${artist} Another Album CD`:`${artist} — ${title} CD 2001`,url:`https://example.com/nautilus-demo/product-${key}-${n}`,
   images:n===2?[]:Array.from({length:n===1?6:2},(_,i)=>image(key,i+1,'listing_image')),seller:{nickname:`Demo Seller ${n}`,ship_from:'UK',rating_count_raw:100+n},seller_rate_percent:99.5,
   condition:{m_media:'Near Mint (NM or M-)',s_sleeve:'Very Good Plus (VG+)',original_condition:{comments:n===1?'<p>Demo listing. CD in excellent condition.</p><p>Original jewel case; light wear on the cover. Photos show this demonstration only.</p>':'Synthetic seller description. This is not a real listing.'}},
   description:{original_description:'Synthetic seller description.'},original_price:{currency:'GBP',sale_type:'fixed_price'},display_tags:[],
   ranking:{rank:n,candidate_rank:excluded?null:n,candidate_id:`${platform_code}:DEMO-${n}`,eligibility:status,identity_tier_label:'演示作品匹配',estimated_cost:estimates,tags,match:{status:'work_match'},reasons:['演示排名，来自结果 JSON'],review_tasks:[]},
   unified_facts:{items:[{obi:n===1?true:n===2?false:null}],issues:[]},dimensions29:dims,semantics_status:excluded?'excluded_by_title':'completed',extraction_findings:[],
   quote_pricing:{userProfileId:profileId,summary:quote===null?'本条暂无可用报价。':`到仓成本 ¥${cost.toFixed(2)}，服务器建议报价 ¥${quote.toFixed(2)}。`,reason:'这是一份虚构的服务器结果，仅供前端接入演示。人工改价不会改变服务器原结果。',result:{status:quote===null?'unavailable':'provisional',costCny:cost,quoteCny:quote,profitCny:quote===null?null:quote-cost,floorCny:cost===null?null:cost,explanationContext:{budgetCny:null,marketCeilingCny:null}}},
   quote_copy:{status:excluded?'skipped':'completed',description:excluded?'':`${artist}《${title}》，CD，2001 年版本。卖家描述盘面近全新，封套轻微使用痕迹。此内容仅为演示。`,reviewed:false}
  };
 });
 return {id,basic:{release_id:Number(id),title,year:2001,country:'UK',medium:'CD',artists:[{name:artist}],formats:[{name:'CD',text:'Jewel Case'}]},artist,identifiers:{catno:'DEMO-001',barcode:null,labels:[{name:'Demo Records',catno:'DEMO-001'}]},cover:image(key,1,'release_reference'),reference_images:[image(key,1,'release_reference'),image(key,2,'release_reference'),image(key,3,'release_reference')],user_avatar:null,
  wish_context:{wish_id:wishId,target_release_id:id,nickname:`示例用户 ${key.toUpperCase()}`,work_title:title,requested_at:'2026-11-22T05:00:00Z',first_login_at:'2026-01-01T00:00:00Z',last_login_at:'2026-11-22T00:00:00Z',payment_history:{lowest_cny:32,highest_cny:197},statistics:{totalwant:24,supplytotal:20,paytotal:8,payrate:0.4,priceratio:0.3}},requirements:{version_requirement:'接受其他版本',obi_requirement_raw:null,remark:key==='b'?'示例备注：希望封套完整。':''},sources,rerank:{version:'demo',summary:{total,eligible:1,manual_review:total-1-(total===7?1:0),excluded:total===7?1:0}},sales_history:{lowest_cny:80,median_cny:140,highest_cny:230,is_example:true}};
}
const releases=[makeRelease('91000001','a','Harbor Letters','The Example Quartet',7),makeRelease('91000002','b','Evening Tides','Demo Ensemble',2)];
const result={schema_version:'nautilus-quote-result/1',status:'completed',demo:true,request_sha256:'0'.repeat(64),generated_at:'2026-11-22T06:00:00Z',releases,totals:{releases:2,sources:9},tag_groups:{work:'作品',version:'版本',images:'图片',condition:'品相',cost:'成本'},pricing_context:{userProfiles:profiles,wishBindings:bindings,defaultUserId:profiles[0].id},limitations:['全部为虚构样例，无真实用户、货源、报价或交易。']};
for(const release of result.releases)for(const source of release.sources){
 const q=source.quote_pricing,price=q.result.quoteCny;
 q.result.version='source-user-quote-v3-priceratio';q.result.priceRatio=.3;
 q.result.prepayment=require('../returned-pricing.js').prepayment(price,{releaseId:null,sourceId:source.ranking.candidate_id,user:{caseId:q.userProfileId}});
 q.summary=q.reason=price===null?'本条暂无可用报价。':`到仓成本 ¥${q.result.costCny.toFixed(2)} ×（1＋30%）＝¥${price.toFixed(2)}。`;
}
fs.writeFileSync(path.join(__dirname,'demo-result.json'),JSON.stringify(result,null,2)+'\n');
