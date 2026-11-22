'use strict';
// Visibility only: never recompute ranks or mutate the source records.
(function(root){
  const defaults=[['EBAYUKUS','eBay'],['YAHOOJAPAN','Yahoo'],['MERC','Mercari'],['AMJP','Amazon JP'],['DSUS','Discogs'],['DISKUNION','Diskunion']];
  const code=s=>s.platform_code||'UNKNOWN';
  function options(sources){
    const rows=new Map(defaults.map(([code,name])=>[code,{code,name,count:0}]));
    for(const s of sources){
      const key=code(s);
      if(!rows.has(key))rows.set(key,{code:key,name:s.platform||s.platform_name||key,count:0});
      rows.get(key).count++;
    }
    return [...rows.values()];
  }
  function ranked(sources,selection=null){
    const selected=selection===null?null:new Set(selection);
    return sources.filter(s=>selected===null||selected.has(code(s))).sort((a,b)=>a.ranking.rank-b.ranking.rank);
  }
  const api={options,ranked};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SourcePlatforms=api;
})(globalThis);
