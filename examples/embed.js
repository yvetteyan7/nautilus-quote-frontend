'use strict';
const frame=document.querySelector('#quote-frame'),status=document.querySelector('#integration-state');
async function sendResult(){
  try{
    const ui=frame.contentWindow.NautilusQuote;
    if(!ui)throw new Error('前端尚未就绪，请稍后再试');
    await ui.ready;
    const response=await fetch('./demo-result.json');
    if(!response.ok)throw new Error('演示 JSON 读取失败');
    const loaded=await ui.loadResult(await response.json());
    status.textContent=`已通过 loadResult 接入：${loaded.releases} 个心愿 / ${loaded.sources} 条货源`;
  }catch(error){status.textContent=error.message;}
}
frame.addEventListener('load',()=>{
  status.textContent='前端就绪，点击按钮传入 JSON';
  frame.contentWindow.addEventListener('nautilus:quote-saved',({detail})=>{
    // Replace this display with your own authenticated save endpoint.
    status.textContent='父页面已收到人工报价草稿（尚未发送给用户）';
    const output=document.querySelector('#saved-draft');output.hidden=false;output.textContent=JSON.stringify(detail,null,2);
  });
});
document.querySelector('#send-result').addEventListener('click',sendResult);
