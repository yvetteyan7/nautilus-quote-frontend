'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.QuoteImages=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  function available(source){
    const seen=new Set();
    return (source.images||[]).filter(image=>{
      if(['release_reference','work_reference'].includes(image.kind)||!image.local||!/^https?:\/\//i.test(image.url||'')||seen.has(image.url))return false;
      seen.add(image.url);return true;
    });
  }
  function selected(source,saved){
    const images=available(source);
    if(!Array.isArray(saved))return images.slice(0,4);
    const urls=new Set(saved);
    // Empty means intentionally none. A refreshed source can only retain its own URLs.
    return images.filter(image=>urls.has(image.url));
  }
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/svg+xml':'svg'};
  const crcTable=Uint32Array.from({length:256},(_,n)=>{
    for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;
    return n>>>0;
  });
  function crc32(bytes){
    let crc=0xffffffff;
    for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);
    return (crc^0xffffffff)>>>0;
  }
  // Store original bytes without recompression or conversion. ZIP UTF-8 names work offline.
  function zip(files){
    if(files.length>65535)throw new Error('素材数量过多');
    const encoder=new TextEncoder(),body=[],directory=[];let offset=0,directorySize=0;
    for(const file of files){
      const name=encoder.encode(file.name),bytes=file.bytes,crc=crc32(bytes);
      if(name.length>65535||bytes.length>0xffffffff||offset+bytes.length>0xffffffff)throw new Error('素材包过大');
      const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);
      l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);local.set(name,30);
      const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);
      c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
      body.push(local,bytes);directory.push(central);offset+=local.length+bytes.length;directorySize+=central.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
    return new Blob([...body,...directory,end],{type:'application/zip'});
  }
  return {available,selected,extensions,zip};
});
