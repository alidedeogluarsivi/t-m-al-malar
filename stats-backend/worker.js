const allowedOrigins=new Set(["https://alidedeogluarsivi.com","https://www.alidedeogluarsivi.com","https://alidedeogluarsivi.github.io"]);
function corsFor(request){const origin=request.headers.get("Origin");return {"Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://alidedeogluarsivi.com","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"}}
function reply(obj,status=200,cors={}){return new Response(JSON.stringify(obj),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
function day(){return new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Istanbul"})}
export default {async fetch(request,env){
 const url=new URL(request.url);
 const cors=corsFor(request);
 const origin=request.headers.get("Origin");
 if(origin&&!allowedOrigins.has(origin))return reply({error:"origin not allowed"},403,cors);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(url.pathname!=="/api/site-stats")return reply({error:"not found"},404,cors);
 if(!env.DB)return reply({error:"database not configured"},503,cors);
 try{
  if(request.method==="POST"){
   const raw=await request.text();
   if(raw.length>1024)return reply({error:"too large"},413,cors);
   let body;try{body=JSON.parse(raw)}catch{return reply({error:"bad json"},400,cors)}
   if(body.type==="visit"){
    const key=body.day==="total"?"visits:total":"visits:"+day();
    await env.DB.batch([env.DB.prepare("INSERT INTO counters(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value=value+1").bind("visits:total"),...(key==="visits:total"?[]:[env.DB.prepare("INSERT INTO counters(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value=value+1").bind(key)])]);
    return reply({ok:true},200,cors);
   }
   if(!["village","family"].includes(body.type)||typeof body.name!=="string")return reply({error:"bad request"},400,cors);
   const name=body.name.replace(/\s+/g," ").trim().slice(0,90);
   if(name.length<2)return reply({error:"invalid name"},400,cors);
   await env.DB.prepare("INSERT INTO searches(kind,label) VALUES(?,?)").bind(body.type,name).run();
   await env.DB.prepare("DELETE FROM searches WHERE id NOT IN (SELECT id FROM searches ORDER BY id DESC LIMIT 500)").run();
   return reply({ok:true},200,cors);
  }
  if(request.method!=="GET")return reply({error:"method"},405,cors);
  const counters=await env.DB.prepare("SELECT name,value FROM counters WHERE name IN (?,?)").bind("visits:total","visits:"+day()).all();
  const totals=Object.fromEntries(counters.results.map(x=>[x.name,x.value]));
  const searches=await env.DB.prepare("SELECT kind,label FROM searches ORDER BY id DESC LIMIT 200").all();
  const recent=kind=>{const names=[],seen=new Set();for(const r of searches.results){if(r.kind!==kind)continue;const key=r.label.toLocaleUpperCase("tr-TR");if(!seen.has(key)){names.push(r.label);seen.add(key)}if(names.length===10)break}return names};
  return reply({total:totals["visits:total"]||0,today:totals["visits:"+day()]||0,villages:recent("village"),families:recent("family")},200,cors);
 }catch(e){return reply({error:"server error"},500,cors)}
}};
