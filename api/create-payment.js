import products from './_data/products.json' with { type:'json' };
import { cors, json, readBody, randomId, randomToken, sha256, hmacBase64, writeJsonBlob, orderPath } from './_lib/store.js';

export default async function handler(req,res){
  if (cors(req,res)) return;
  if (req.method !== 'POST') return json(res,405,{error:'method_not_allowed'});
  try {
    for (const k of ['PAYTR_MERCHANT_ID','PAYTR_MERCHANT_KEY','PAYTR_MERCHANT_SALT']) {
      if (!process.env[k]) return json(res,503,{error:'payment_not_configured'});
    }
    const body=await readBody(req);
    const product=products.find(x=>x.product_id===body.product_id && x.active);
    if (!product || !product.price_tl) return json(res,404,{error:'product_not_available'});

    const callbackId=randomId('cb');
    const customerToken=randomToken();
    const price=String(Math.round(Number(product.price_tl)*100));
    const currency='TL', maxInstallment='1', linkType='product', lang='tr', minCount='1';
    const required=product.name.slice(0,200)+price+currency+maxInstallment+linkType+lang+minCount;
    const paytrToken=hmacBase64(process.env.PAYTR_MERCHANT_KEY, required+process.env.PAYTR_MERCHANT_SALT);

    const base=(process.env.PUBLIC_API_BASE || ('https://'+req.headers.host)).replace(/\/$/,'');
    const callbackLink=base+'/api/paytr-callback';

    const order={
      callback_id:callbackId,
      product_id:product.product_id,
      product_name:product.name,
      expected_payment_amount:price,
      currency,
      status:'pending',
      customer_token_hash:sha256(customerToken),
      created_at:new Date().toISOString(),
      paid_at:null,
      paytr_link_id:null,
      merchant_oid:null
    };
    await writeJsonBlob(orderPath(callbackId),order);

    const form=new URLSearchParams({
      merchant_id:process.env.PAYTR_MERCHANT_ID,
      name:product.name.slice(0,200),
      price,
      currency,
      max_installment:maxInstallment,
      link_type:linkType,
      lang,
      min_count:minCount,
      max_count:'1',
      callback_link:callbackLink,
      callback_id:callbackId,
      debug_on:process.env.PAYTR_DEBUG_ON || '0',
      paytr_token:paytrToken
    });

    const r=await fetch('https://www.paytr.com/odeme/api/link/create',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:form
    });
    const data=await r.json().catch(()=>null);
    if (!r.ok || !data || data.status!=='success') {
      order.status='payment_link_failed';
      order.paytr_error=data?.reason || data?.err_msg || 'unknown';
      await writeJsonBlob(orderPath(callbackId),order);
      return json(res,502,{error:'payment_link_failed',detail:order.paytr_error});
    }
    order.paytr_link_id=data.id || null;
    await writeJsonBlob(orderPath(callbackId),order);
    return json(res,200,{
      order_id:callbackId,
      order_token:customerToken,
      payment_url:data.link || data.url || (data.id ? 'https://www.paytr.com/link/'+data.id : null)
    },{'Cache-Control':'no-store'});
  } catch(e) {
    return json(res,500,{error:'server_error'});
  }
}
