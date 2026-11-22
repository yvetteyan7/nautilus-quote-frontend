'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResultAdapter = api;
})(globalThis, function() {
  const SCHEMA = 'nautilus-quote-result/1';
  const dimensions = Array.from({length: 29}, (_, i) => String(i + 1).padStart(2, '0'));
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const money = v => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  const check = (ok, path, message) => {if (!ok) throw new Error(path + '：' + message);};
  function validate(result) {
    check(object(result) && result.schema_version === SCHEMA, 'schema_version', '需要 ' + SCHEMA + '，请传精排结果而非原始找货 JSON');
    check(result.status === 'completed', 'status', '任务尚未完成');
    check(Array.isArray(result.releases), 'releases', '必须是数组');
    check(object(result.totals), 'totals', '缺少总数');
    check(typeof result.request_sha256 === 'string' && result.request_sha256.length > 0, 'request_sha256', '缺少请求标识');
    check(typeof result.generated_at === 'string', 'generated_at', '缺少结果生成时间');
    const context = result.pricing_context;
    check(object(context) && Array.isArray(context.userProfiles) && object(context.wishBindings), 'pricing_context', '缺少用户及心愿绑定');
    const profiles = new Map();
    for (const p of context.userProfiles) {
      check(object(p) && typeof p.id === 'string' && !profiles.has(p.id), 'userProfiles', '用户标识缺失或重复');
      profiles.set(p.id, p);
    }
    const releaseIDs = new Set(), sourceIDs = new Set();
    for (const [ri, r] of result.releases.entries()) {
      const path = 'releases[' + ri + ']', id = String(r?.id);
      check(object(r) && /^\d+$/.test(id) && !releaseIDs.has(id), path + '.id', '版本 ID 无效或重复；当前协议同一结果不允许重复版本 ID');
      releaseIDs.add(id);
      check(object(r.basic) && typeof r.basic.title === 'string', path + '.basic', '缺少目标作品标题');
      check(Array.isArray(r.sources), path + '.sources', '必须是数组');
      const binding = context.wishBindings[id], profile = profiles.get(binding?.profileId);
      check(profile && r.wish_context?.wish_id &&
        binding.wishId === r.wish_context.wish_id && profile.wishId === binding.wishId &&
        String(profile.targetReleaseId) === id && String(r.wish_context.target_release_id) === id,
        path + '.wish_context', '心愿、用户、版本绑定不一致');
      const ranks = [];
      for (const [si, s] of r.sources.entries()) {
        const sp = path + '.sources[' + si + ']';
        check(object(s) && typeof s.id === 'string' && s.id.startsWith(id + ':') && !sourceIDs.has(s.id), sp + '.id', '货源 ID 无效或重复');
        sourceIDs.add(s.id);
        check(object(s.ranking) && Number.isInteger(s.ranking.rank) && s.ranking.rank > 0, sp + '.ranking.rank', '缺少服务器原始排名');
        ranks.push(s.ranking.rank);
        check(['eligible', 'manual_review', 'excluded'].includes(s.ranking.eligibility), sp + '.ranking.eligibility', '未知资格状态');
        check(object(s.dimensions29) && Object.keys(s.dimensions29).length === 29 && dimensions.every(k => Object.hasOwn(s.dimensions29, k)), sp + '.dimensions29', '需要 01–29 全部键，不能把缺失值改成猜测值');
        const cost = s.ranking.estimated_cost, quote = s.quote_pricing;
        check(object(cost) && Array.isArray(cost.routes) && Object.hasOwn(cost, 'selected_route'), sp + '.ranking.estimated_cost', '缺少到仓成本与路径');
        check(cost.selected_route === null || (object(cost.selected_route) && typeof cost.selected_route.total_cost_cny === 'number' && money(cost.selected_route.total_cost_cny)), sp + '.selected_route', '成本必须是数值或无路径');
        check(object(quote?.result) && quote.userProfileId === profile.id, sp + '.quote_pricing', '定价缺失或不属于该用户');
        check(money(quote.result.quoteCny) && money(quote.result.costCny), sp + '.quote_pricing.result', '报价及成本必须为数值或 null');
        check(quote.result.costCny === (cost.selected_route?.total_cost_cny ?? null), sp + '.quote_pricing.result.costCny', '定价成本与排名成本不一致');
        check(typeof quote.summary === 'string' && typeof quote.reason === 'string', sp + '.quote_pricing', '缺少服务器定价理由');
        check(Array.isArray(s.ranking.tags), sp + '.ranking.tags', '缺少服务器校验标签');
      }
      ranks.sort((a, b) => a - b);
      check(ranks.every((n, i) => n === i + 1), path + '.sources', '原始排名必须是完整的 1…N；不要预先筛掉货源');
    }
    check(result.totals.sources === sourceIDs.size && result.totals.releases === releaseIDs.size, 'totals', '货源或心愿总数不一致');
    return result;
  }
  // Only HTTP(S) or same-origin relative asset paths. Ignore server /media hashes:
  // those paths belong to the backend host and are not static assets in this repo.
  function safeImageURL(value, baseURL) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, baseURL);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch {return null;}
  }
  function prepare(result, {baseURL = 'http://localhost/', imageURL = url => url, resultID} = {}) {
    validate(result);
    const cloned = JSON.parse(JSON.stringify(result));
    const records = new Map(), revision = resultID || result.request_sha256 + ':' + result.generated_at;
    const adaptImage = image => {
      if (!object(image)) return null;
      const original = safeImageURL(image.url, baseURL);
      if (!original) return null;
      const resolved = safeImageURL(imageURL(original, image), baseURL);
      return resolved ? {...image, url: original, local: resolved} : null;
    };
    for (const r of cloned.releases) {
      r.id = String(r.id);
      r.requirements ||= {};
      r.identifiers ||= {};
      r.cover = adaptImage(r.cover);
      r.user_avatar = adaptImage(r.user_avatar);
      r.reference_images = (r.reference_images || []).map(adaptImage).filter(Boolean);
      r.import_context = {hide_preview_user: true, hide_pricing_controls: false,
        unified_rerank: true, bound_user_pricing: true, result_snapshot: true,
        result_sha256: revision, generated_at: result.generated_at};
      r.rerank ||= {};
      const counts = {total: r.sources.length, eligible: 0, manual_review: 0, excluded: 0};
      for (const s of r.sources) {
        counts[s.ranking.eligibility]++;
        s.images = (s.images || []).map(adaptImage).filter(Boolean);
        s.seller ||= {};
        s.seller_rate_percent = typeof s.seller_rate_percent === 'number' ? s.seller_rate_percent : null;
        s.condition ||= {};
        s.display_tags ||= [];
        s.detail_url = 'memory:source:' + s.id;
        records.set(s.detail_url, s);
      }
      // Counts are presentation summaries; never recompute a judgment or rank.
      r.rerank.summary = {...r.rerank.summary, ...counts};
    }
    cloned.pricing_context.userProfiles.forEach(p => {p.targetReleaseId = String(p.targetReleaseId); p.pricing ||= {};});
    const index = {...cloned, pricing_context_url: 'memory:pricing-context'};
    records.set(index.pricing_context_url, cloned.pricing_context);
    return {index, records, resultID: revision};
  }
  return {SCHEMA, validate, prepare, safeImageURL};
});
