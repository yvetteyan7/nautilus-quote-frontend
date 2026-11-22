'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.QuoteUsers=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  const VERSION='quote-users/2';
  function select(context,id){
    const users=context.userProfiles||[];
    const user=users.find(u=>u.id===id)||users.find(u=>u.id===context.defaultUserId);
    if(!user)throw new Error('报价用户资料缺失');
    return user;
  }
  function forRelease(context,release,id){
    if(!context.wishBindings)return select(context,id);
    const binding=context.wishBindings[String(release.id)];
    const user=context.userProfiles.find(u=>u.id===binding?.profileId);
    if(!user||binding.wishId!==release.wish_context?.wish_id||
       user.wishId!==binding.wishId||user.targetReleaseId!==String(release.id))
      throw new Error('心愿与报价用户不匹配');
    return user;
  }
  // Replace the whole input on every switch: absent spend/budget must never leak from another user.
  const input=user=>({...JSON.parse(JSON.stringify(user.pricing)),caseId:user.id});
  const key=(userId,releaseId,sourceId)=>JSON.stringify([VERSION,userId,releaseId,sourceId]);
  function draft(drafts,userId,defaultId,releaseId,sourceId){
    const own=drafts[key(userId,releaseId,sourceId)];
    if(own)return own;
    // Keep earlier unbound notes available to the original case. Old prices fail the new fingerprint.
    return userId===defaultId?(drafts[releaseId+':'+sourceId]||{}):{};
  }
  return {VERSION,select,forRelease,input,key,draft};
});
