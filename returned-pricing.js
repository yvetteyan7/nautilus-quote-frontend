'use strict';
// No pricing policy lives here. Display server decisions; validate a manually
// edited amount against the floor/ceiling that the server already returned.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {root.StrategyQuote = api; root.QuotePricing = api;}
})(globalThis, function() {
  const VERSION = 'returned-pricing/1';
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
  const explain = () => '服务器未提供定价说明。';
  return {VERSION, evaluate, fingerprint, validation, explain, summary: explain};
});
