'use strict';
// Display server prices without repricing. Only the prepayment allocation for
// a manually edited quote is computed locally, with the server rule version.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {root.StrategyQuote = api; root.QuotePricing = api;}
})(globalThis, function() {
  const VERSION = 'returned-pricing/2';
  function evaluate(release, source) {return source.quote_pricing.result;}
  function fingerprint(release, source) {
    return JSON.stringify([VERSION, release.import_context.result_sha256, release.id, source.id, source.quote_pricing]);
  }
  function validation(result, price) {
    if (result.quoteCny === null) return {valid: false, message: '服务器未给出可用报价。'};
    if (!Number.isFinite(price) || price <= 0 || price > 999999 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6)
      return {valid: false, message: '请输入有效金额，最多保留两位小数。'};
    if (Number.isFinite(result.floorCny) && price < result.floorCny)
      return {valid: false, message: '报价不能低于服务器下限 ¥' + result.floorCny.toFixed(2)};
    const ceilings = [result.explanationContext?.budgetCny, result.explanationContext?.marketCeilingCny].filter(Number.isFinite);
    if (ceilings.length && price > Math.min(...ceilings))
      return {valid: false, message: '报价高于服务器返回的有效上限。'};
    return {valid: true, message: '保存仅留在本机。'};
  }
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  function prepayment(quoteCny,input){
    if(!finite(quoteCny)||quoteCny<.01||quoteCny>999999||
      Math.abs(quoteCny*100-Math.round(quoteCny*100))>1e-6||!input?.sourceId)return null;
    const rule='quote-prepayment/1',total=Math.round(quoteCny*100),base=Math.round(total/3);
    // Stable per wish/customer, listing and quoted amount, including across reloads.
    // This is a pricing variation, not security randomness. Store the actual offset for audit.
    const seed=JSON.stringify([rule,input.user?.caseId||'',input.releaseId,input.sourceId,total]);
    let hash=2166136261;
    for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
    const amount=Math.max(1,Math.min(total,base+(hash%2001)-1000));
    return {rule,quoteCny,amountCny:amount/100,remainingCny:(total-amount)/100,
      baseCny:base/100,adjustmentCny:(amount-base)/100};
  }
  function prepaymentFor(price,release,source,profileId){
    const result=source.quote_pricing.result;
    if(!validation(result,price).valid)return null;
    if(price===result.quoteCny && result.prepayment)return JSON.parse(JSON.stringify(result.prepayment));
    const ranking=source.ranking||{},exact=ranking.match?.status==='exact_release'||ranking.match?.platform_release_id_matches===true;
    return prepayment(price,{sourceId:result.sourceId??ranking.candidate_id??source.id,
      releaseId:Object.hasOwn(result,'releaseId')?result.releaseId:(exact?release.id:null),user:{caseId:profileId}});
  }
  const explain = () => '服务器未提供定价说明。';
  return {VERSION, evaluate, fingerprint, validation, prepayment, prepaymentFor, explain, summary: explain};
});
