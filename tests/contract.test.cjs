const {test}=require('node:test');
const assert=require('node:assert/strict');
const adapter=require('../result-adapter.js');
const platforms=require('../platform-filter.js');
const pricing=require('../returned-pricing.js');
const images=require('../quote-images.js');
const demo=require('../examples/demo-result.json');
const copy=()=>JSON.parse(JSON.stringify(demo));

test('result remains immutable; all server rank/tag/pricing/copy/29-field records survive adaptation',()=>{
  const input=copy(),before=JSON.stringify(input),prepared=adapter.prepare(input);
  for(const [ri,r] of input.releases.entries())for(const [si,s] of r.sources.entries()){
    const displayed=prepared.index.releases[ri].sources[si];
    for(const key of ['ranking','quote_pricing','quote_copy','dimensions29','unified_facts'])assert.deepEqual(displayed[key],s[key]);
    assert.equal(prepared.records.get(displayed.detail_url),displayed);
    assert.equal(pricing.evaluate(prepared.index.releases[ri],displayed).quoteCny,s.quote_pricing.result.quoteCny);
  }
  assert.equal(JSON.stringify(input),before);
});
test('platform filter keeps original ranks, excluded rows and the input ordering',()=>{
  const sources=copy().releases[0].sources.reverse(),before=JSON.stringify(sources);
  const filtered=platforms.ranked(sources,['DSUS','MERC','EBAYUKUS']);
  assert.deepEqual(filtered.map(s=>s.ranking.rank),[1,2,3,7]);
  assert.equal(filtered.at(-1).ranking.candidate_rank,null);
  assert.equal(JSON.stringify(sources),before);
  assert.equal(platforms.ranked(sources,[]).length,0);
});
const invalidCases=[
  ['raw JSON',r=>{r.schema_version='raw-wish-export';},/schema_version/],
  ['unfinished job',r=>{r.status='running';},/status/],
  ['customer binding',r=>{r.pricing_context.wishBindings['91000001'].profileId='DEMO-PROFILE-b';},/绑定/],
  ['source price belongs to another customer',r=>{r.releases[0].sources[0].quote_pricing.userProfileId='DEMO-PROFILE-b';},/定价/],
  ['missing dimension',r=>{delete r.releases[0].sources[0].dimensions29['13'];},/01–29/],
  ['cost mismatch',r=>{r.releases[0].sources[0].quote_pricing.result.costCny+=1;},/成本不一致/],
  ['missing price rather than null',r=>{delete r.releases[0].sources[0].quote_pricing.result.quoteCny;},/数值或 null/],
  ['duplicated original rank',r=>{r.releases[0].sources[1].ranking.rank=1;},/原始排名/],
  ['inconsistent totals',r=>{r.totals.sources=1;},/总数/],
  ['duplicate release',r=>{r.releases.push(r.releases[0]);},/ID 无效或重复/],
  ['duplicate source',r=>{r.releases[0].sources[1].id=r.releases[0].sources[0].id;},/货源 ID/]
];
for(const [name,mutate,error] of invalidCases)test('reject '+name,()=>{const r=copy();mutate(r);assert.throws(()=>adapter.prepare(r),error);});
test('null means unknown, zero stays zero; empty dimensions stay empty',()=>{
  const r=copy(),s=r.releases[0].sources[0];
  s.ranking.estimated_cost.selected_route.total_cost_cny=0;s.quote_pricing.result.costCny=0;
  const out=adapter.prepare(r).index;
  assert.equal(out.releases[0].sources[0].quote_pricing.result.costCny,0);
  assert.equal(out.releases[1].sources[1].quote_pricing.result.costCny,null);
  assert.deepEqual(out.releases[0].sources[0].dimensions29['29'],[]);
});
test('image URLs resolve on a deployment subpath and discard unsafe schemes',()=>{
  const r=copy(),s=r.releases[0].sources[0];
  s.images.push({url:'javascript:alert(1)'},{url:'data:text/html,test'},{url:'https://user:password@example.com/image'},{local:'/media/not-a-url'});
  const out=adapter.prepare(r,{baseURL:'https://partner.example/quote/',imageURL:()=> './image-proxy?id=demo'});
  assert.equal(out.index.releases[0].sources[0].images.length,6);
  assert.equal(out.index.releases[0].sources[0].images[0].local,'https://partner.example/quote/image-proxy?id=demo');
  assert.equal(adapter.prepare(r).index.releases[0].sources[0].images[0].local,s.images[0].url);
});
test('default four pictures, manual empty selection, and target references are excluded',()=>{
  const s=copy().releases[0].sources[0];
  assert.equal(images.selected(s).length,4);
  assert.equal(images.selected(s,[]).length,0);
  assert.deepEqual(images.selected(s,[s.images[4].url]).map(i=>i.url),[s.images[4].url]);
  s.images[4].kind='release_reference';assert.equal(images.selected(s,[s.images[4].url]).length,0);
});
test('manual price honors returned limits, never generates a missing quote',()=>{
  const r={quoteCny:140,floorCny:120,explanationContext:{budgetCny:160}};
  assert.equal(pricing.validation(r,119).valid,false);
  assert.equal(pricing.validation(r,170).valid,false);
  assert.equal(pricing.validation(r,145.123).valid,false);
  assert.equal(pricing.validation(r,145.12).valid,true);
  assert.equal(pricing.validation({...r,quoteCny:null},145).valid,false);
});
test('a new result snapshot isolates prior draft prices',()=>{
  const {index}=adapter.prepare(copy());const r=index.releases[0],s=r.sources[0];const first=pricing.fingerprint(r,s);
  r.import_context.result_sha256='new-result';assert.notEqual(first,pricing.fingerprint(r,s));
});
test('empty completed result renders an empty state',()=>{
  const r=copy();r.releases=[];r.totals={releases:0,sources:0};assert.equal(adapter.prepare(r).index.releases.length,0);
});

test('prepayment matches returned machine result and follows edited quote without mutation',()=>{
  const r=copy(),release=r.releases[0],source=release.sources[0],profile=source.quote_pricing.userProfileId;
  const original=JSON.stringify(r),q=source.quote_pricing.result;
  assert.deepEqual(pricing.prepaymentFor(q.quoteCny,release,source,profile),q.prepayment);
  const edited=pricing.prepaymentFor(200,release,source,profile);
  assert.equal(edited.quoteCny,200);
  assert.equal(Math.round(edited.amountCny*100)+Math.round(edited.remainingCny*100),20000);
  assert.ok(Math.abs(edited.adjustmentCny)<=10);
  assert.deepEqual(pricing.prepaymentFor(200,release,source,profile),edited);
  assert.equal(JSON.stringify(r),original);
  delete q.prepayment;
  assert.deepEqual(pricing.prepaymentFor(200,release,source,profile),edited);
  q.quoteCny=null;assert.equal(pricing.prepaymentFor(200,release,source,profile),null);
});
test('reject inconsistent deposit and quoted amount',()=>{
  const r=copy();r.releases[0].sources[0].quote_pricing.result.prepayment.remainingCny+=1;
  assert.throws(()=>adapter.prepare(r),/预付金额/);
});
test('prepayment clamps tiny amounts and rejects invalid input',()=>{
  const context={sourceId:'example',releaseId:null,user:{caseId:'example'}};
  for(const amount of [.01,1,5,182.81,999999]){
    const d=pricing.prepayment(amount,context);
    assert.ok(d.amountCny>=.01&&d.amountCny<=amount);
    assert.equal(Math.round(d.amountCny*100)+Math.round(d.remainingCny*100),Math.round(amount*100));
  }
  for(const price of [null,NaN,-1,0,1.111,1000000])assert.equal(pricing.prepayment(price,context),null);
});
