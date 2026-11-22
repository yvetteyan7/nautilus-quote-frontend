'use strict';
// Presentation only: all order, costs and decisions arrive from Python.
const isUnified = r => Boolean(r?.import_context?.unified_rerank);
const rankStatus = value => ({eligible:'满足本轮规则',manual_review:'待核实',excluded:'排除'}[value]||value);
const candidateLabel = s => s.ranking.candidate_rank == null ? '已排除' : '#'+s.ranking.candidate_rank;
const previousRankLabel = c => c.old_rank == null ? '已排除' : '#'+c.old_rank;
function unifiedCostDisplay(s,{showNotes=true}={}) {
  const cost=s.ranking.estimated_cost;
  if(cost.selected_route) return '<span>到中国仓采购成本</span><strong>'+cash(cost.selected_route.total_cost_cny)+'</strong>';
  const partial=cost.partial_quotes||[],known=partial.filter(p=>p.components_cny.sale!=null);
  const price=known.map(p=>cash(p.components_cny.sale)+(known.length>1?'（'+escape(warehouseName(p.warehouse_id))+'仓）':'')).join(' / ');
  const notes=[...new Set(partial.flatMap(p=>p.notes||[]))];
  return '<span>'+(known.length?'已知商品价'+(known.length===1?'（'+escape(warehouseName(known[0].warehouse_id))+'仓报价）':'（分仓）'):'到中国仓采购成本')+'</span><strong>'+(price||'—')+'</strong>'+(showNotes?'<small class="partial-cost-note">'+escape(notes.join('；')||'费用待核实')+' · 到仓成本待核实</small>':'');
}
function ruleChangeSummary(r) {
  const old=r.rerank.old_summary,n=r.rerank.summary;
  if(!old)return '共 '+n.total+' 条：'+n.eligible+' 条满足本轮规则 / '+n.manual_review+' 条待核实 / '+n.excluded+' 条排除。';
  return '旧版：'+old.eligible+'条满足规则 / '+old.manual_review+'条待核实 / '+old.excluded+'条排除 → 新版：'+n.eligible+' / '+n.manual_review+' / '+n.excluded+'。';
}
function rerankDownloads(r) {
  const names={input:'统一输入',result:'精排结果',conflicts:'字段冲突',review:'待核实项', 'old-v2':'旧版 V2', 'old-v3':'上版 V'+String(r.rerank.old_version||'3.0').split('-')[0], 'new-v3':'新版结果',comparison:'逐条对照'};
  return '<div class="rerank-downloads">'+Object.entries(r.rerank.downloads||{}).map(([k,p])=>'<a download href="'+escape(appURL(p))+'">'+escape(names[k]||k)+' ↓</a>').join('')+'</div>';
}
function rerankComparison(r) {
  const hasComparison=Boolean(r.rerank.old_summary);
  const sources=[...r.sources].sort((a,b)=>a.ranking.rank-b.ranking.rank);
  return '<p>'+escape(ruleChangeSummary(r))+'</p><p>指定Release → 同Master → 作品文本相符 → 目标作品有文本支持 → 作品归属不明。同档内先比较资格与成本是否可算，再比较完整到仓成本；同成本先比较图片九档，再比较卖家评分。版本相似分与通用品相分不参与新版排序。</p><p>已排除货源无候选排名。品相保留原平台描述，未评级；低价不等于符合心愿。</p>'+rerankDownloads(r)+
    '<div class="rerank-comparison-scroll"><table class="rerank-comparison"><thead><tr><th>新排名 / 状态</th><th>货源</th><th>版本层级</th><th>到中国仓成本</th><th>图片九档</th>'+(hasComparison?'<th>旧版对照</th>':'')+'<th>排序理由与待核实</th></tr></thead><tbody>'+sources.map(s=>{
      const q=s.ranking,c=q.comparison,b=bestRoute(s);
      return '<tr data-comparison-source="'+escape(s.product_id)+'"><td>'+candidateLabel(s)+'<br>'+escape(rankStatus(q.eligibility))+'</td><td><strong>'+escape(platform(s))+' · '+escape(s.product_id)+'</strong><p>'+escape(s.title)+'</p><small>'+escape(platform(s)+'盘面：'+text(s.condition.m_media)+'；封套：'+text(s.condition.s_sleeve))+'</small></td><td>'+escape(q.identity_tier_label)+'</td><td><div class="cost-display">'+unifiedCostDisplay(s)+'</div></td><td>'+imagePriorityLabel(s)+'</td>'+  (hasComparison?'<td>'+previousRankLabel(c)+' · '+escape(rankStatus(c.old_status))+'<br>'+cash(c.old_cost)+(c.change_notes||[]).map(x=>'<p>'+escape(x)+'</p>').join('')+'<details><summary>旧版理由</summary>'+c.old_reasons.map(x=>'<p>'+escape(x)+'</p>').join('')+'</details></td>':'')+'<td>'+q.reasons.map(x=>'<p>'+escape(x)+'</p>').join('')+(q.review_tasks.length?'<strong>待核实</strong><ul>'+q.review_tasks.map(t=>'<li>'+escape(t.note)+'</li>').join('')+'</ul>':'')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}
function unifiedSelection(s,r) {
  const q=s.ranking;
  const routes=[...q.estimated_cost.routes.filter(p=>p.calculation_complete),...(q.estimated_cost.partial_quotes||[])];
  const routeRows=routes.map(p=>'<tr><td>'+escape(warehouseName(p.warehouse_id))+'</td><td>'+cash(p.components_cny.sale)+'</td><td>'+cash(p.components_cny.tax)+'</td><td>'+cash(p.components_cny.shipping)+'</td><td>'+cash(p.transfer_to_china_cny)+'</td><td>'+cash(p.total_cost_cny)+'</td><td>'+escape(p.usable_for_ranking===false?(p.notes||[]).join('；'):'可计算')+'</td></tr>').join('');
  return '<section class="quote unified-selection" aria-label="采购成本"><div class="quote-heading"><h3>采购成本</h3></div><div class="unified-cost cost-display">'+unifiedCostDisplay(s)+'</div><div class="rerank-comparison-scroll"><table class="cost-table"><thead><tr><th>仓</th><th>商品</th><th>税</th><th>运费</th><th>转运</th><th>合计</th><th>状态</th></tr></thead><tbody>'+routeRows+'</tbody></table></div></section>';
}

function imagePriorityLabel(s) {
  const p=s.ranking?.checks?.image_priority||(s.ranking?.tags||[]).find(t=>t.module==='images'&&t.dimension==='platform_tier')?.observed;
  if(!p||p.tier==null)return '未定义';
  const label={actual:'实物图',sample:'样图',none:'无图',unknown:'图片类型未确认',conflict:'图片证据冲突'}[p.image_type]||'待核实';
  return '第 '+escape(p.tier)+' 档 · '+escape(label);
}
function semanticDetails(s) {
  const e=s.semantic_extraction;
  if(!e)return '';
  if(e.status==='excluded_by_title')return '<h4>标题粗筛</h4><p>标题粗筛已排除，未调用模型。</p><details><summary>粗筛依据</summary><pre>'+escape(JSON.stringify(e.title_screen,null,2))+'</pre></details>';
  const corrections=e.year_corrections?.length?'<details><summary>年代修正记录</summary><pre>'+escape(JSON.stringify(e.year_corrections,null,2))+'</pre></details>':'';
  const support=e.source_support_changes?.length?'<details><summary>原文支撑校验记录</summary><pre>'+escape(JSON.stringify(e.source_support_changes,null,2))+'</pre></details>':'';
  return '<h4>29 栏与模型记录</h4><p>'+escape(e.model||'Flash')+' · 关闭思考 · 每条货源独立提取</p><details><summary>29 栏提取结果（代码校验后，含原始字段引用）</summary><pre>'+escape(JSON.stringify(e.effective_dimensions||e.dimensions,null,2))+'</pre></details>'+support+corrections+'<details><summary>排序使用的事实</summary><pre>'+escape(JSON.stringify(s.unified_facts,null,2))+'</pre></details><details><summary>模型 User Prompt</summary><pre>'+escape(JSON.stringify(e.model_input,null,2))+'</pre></details><details><summary>模型原始输出</summary><pre>'+escape(JSON.stringify(e.model_output,null,2))+'</pre></details>';
}
