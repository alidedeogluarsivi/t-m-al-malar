import {put,list} from '@vercel/blob';
const PREFIX='public-search-stats/v1/';
function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');}
export default async function handler(req,res){
 headers(res);
 if(req.method==='GET'){
  try{
   const out=await list({prefix:PREFIX,limit:100});
   const records=out.blobs.map(b=>{const m=b.pathname.match(/\/(village|family)\/([0-9]{13})-([^-]+)-[a-z0-9]+$/);return m?{type:m[1],name:decodeURIComponent(m[3]),time:Number(m[2])}:null}).filter(Boolean).sort((a,b)=>b.time-a.time);
   const uniq=(type,n)=>{const seen=new Set();return records.filter(x=>x.type===type).map(x=>x.name).filter(name=>{const k=name.toLocaleLowerCase('tr');if(seen.has(k))return false;seen.add(k);return true}).slice(0,n)};
   return res.status(200).json({villages:uniq('village',3),families:uniq('family',5)});
  }catch(_){return res.status(503).json({error:'Veri deposu erişilemiyor'});}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
 const origin=req.headers.origin||'';
 if(origin && !/^https:\/\/(www\.)?alidedeogluarsivi\.com$/.test(origin))return res.status(403).end();
 const {type,name}=req.body||{};
 if(!['village','family'].includes(type)||typeof name!=='string'||name.length>90||!/^[\p{L}\p{N} .,'’()\-]+$/u.test(name)||name.trim().length<2)return res.status(400).end();
 try{
  const safe=encodeURIComponent(name.trim().replace(/\s+/g,' '));
  const suffix=Date.now()+'-'+safe+'-'+Math.random().toString(36).slice(2,9);
  await put(PREFIX+type+'/'+suffix,'1',{access:'public',addRandomSuffix:false,contentType:'text/plain'});
  return res.status(204).end();
 }catch(_){return res.status(503).json({error:'Kayıt hizmeti erişilemiyor'});}
}
