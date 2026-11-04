import products from './_data/products.json' with { type:'json' };
import { get } from '@vercel/blob';
import { sha256, safeEqual, readJsonBlob, orderPath } from './_lib/store.js';

export default async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;return res.end('METHOD');}
  try{
    const u=new URL(req.url,'https://local');
    const id=u.searchParams.get('id'), token=u.searchParams.get('token');
    const order=await readJsonBlob(orderPath(id));
    if(!order || order.status!=='paid' || !safeEqual(order.customer_token_hash,sha256(token))){
      res.statusCode=403; return res.end('YETKISIZ');
    }
    const product=products.find(x=>x.product_id===order.product_id);
    if(!product){res.statusCode=404;return res.end('URUN YOK');}
    const blob=await get(product.delivery_path,{access:'private'});
    if(!blob || blob.statusCode!==200 || !blob.stream){res.statusCode=404;return res.end('PDF HENUZ YUKLENMEMIS');}
    res.statusCode=200;
    res.setHeader('Content-Type',blob.blob.contentType||'application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="${product.product_id}.pdf"`);
    res.setHeader('Cache-Control','private, no-store');
    const reader=blob.stream.getReader();
    while(true){const {done,value}=await reader.read(); if(done)break; res.write(Buffer.from(value));}
    return res.end();
  }catch(e){res.statusCode=500;return res.end('HATA');}
}
