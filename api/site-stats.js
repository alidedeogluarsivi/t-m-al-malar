import {put,list} from '@vercel/blob';
const PREFIX='public-search-stats/v1/';
function headers(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const origin=req.headers.origin||'';
 const allowed=['https://alidedeogluarsivi.com','https://www.alidedeogluarsivi.com','https://alidedeogluarsivi.github.io'];
 if(allowed.includes(origin)){
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
 }
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
function parseBlob(blob){
 try{
  const p=decodeURIComponent(blob.pathname||'');
  const m=p.match(/\/(village|family)\/(\d{13})[-_]([a-z0-9]{6,12})[-_](.+)$/i);
  if(!m)return null;
  return {type:m[1],time:Number(m[2]),name:decodeURIComponent(m[4]).replace(/\s+/g,' ').trim()};
 }catch(_){return null}
}
export default async function handler(req,res){
 headers(req,res);
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method==='GET'){
  try{
   const records=[];
   let cursor;
   for(let page=0;page<5;page++){
    const response=await list({prefix:PREFIX,limit:1000,...(cursor?{cursor}:{})});
    records.push(...response.blobs.map(parseBlob).filter(Boolean));
    if(!response.hasMore||!response.cursor)break;
    cursor=response.cursor;
   }
   records.sort((a,b)=>b.time-a.time);
   const unique=(type,count)=>{
    const seen=new Set();
    return records.filter(x=>x.type===type).map(x=>x.name).filter(name=>{
     const k=name.toLocaleUpperCase('tr-TR');
     if(seen.has(k))return false;
     seen.add(k);return true;
    }).slice(0,count);
   };
   return res.status(200).json({villages:unique('village',10),families:unique('family',10)});
  }catch(_){return res.status(503).json({error:'Arama kayıtları veri deposu erişilemiyor'});}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
 const origin=req.headers.origin||'';
 if(origin&&!/^https:\/\/(www\.)?alidedeogluarsivi\.com$/.test(origin)
   &&origin!=='https://alidedeogluarsivi.github.io')return res.status(403).end();
 const {type,name}=req.body||{};
 if(!['village','family'].includes(type)||typeof name!=='string'||name.length>90
  ||!/^[\p{L}\p{N} .,\u2019'()\-/]+$/u.test(name)||name.trim().length<2)
  return res.status(400).end();
 try{
  const safe=encodeURIComponent(name.trim().replace(/\s+/g,' '));
  const key=Date.now()+'-'+Math.random().toString(36).slice(2,10)+'-'+safe;
  await put(PREFIX+type+'/'+key,'1',{access:'public',addRandomSuffix:false,contentType:'text/plain'});
  return res.status(204).end();
 }catch(_){return res.status(503).json({error:'Arama kayıt servisine yazılamadı'});}
}
