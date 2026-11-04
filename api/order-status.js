import products from './_data/products.json' with { type:'json' };
import { cors, json, sha256, safeEqual, readJsonBlob, orderPath } from './_lib/store.js';

export default async function handler(req,res){
  if (cors(req,res)) return;
  if (req.method!=='GET') return json(res,405,{error:'method_not_allowed'});
  const u=new URL(req.url,'https://local');
  const id=u.searchParams.get('id'), token=u.searchParams.get('token');
  if(!id||!token) return json(res,400,{error:'missing_order'});
  const order=await readJsonBlob(orderPath(id));
  if(!order || !safeEqual(order.customer_token_hash,sha256(token))) return json(res,404,{error:'order_not_found'});
  const p=products.find(x=>x.product_id===order.product_id);
  return json(res,200,{
    order_id:id,
    status:order.status,
    product_name:order.product_name,
    paid_at:order.paid_at,
    download_url:order.status==='paid' && p ? `/api/download?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}` : null
  },{'Cache-Control':'no-store'});
}
