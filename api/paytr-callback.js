import { readBody, hmacBase64, safeEqual, readJsonBlob, writeJsonBlob, orderPath } from './_lib/store.js';

export default async function handler(req,res){
  if (req.method!=='POST'){res.statusCode=405;return res.end('METHOD');}
  try {
    const p=await readBody(req);
    const calc=hmacBase64(
      process.env.PAYTR_MERCHANT_KEY,
      String(p.callback_id||'')+String(p.merchant_oid||'')+process.env.PAYTR_MERCHANT_SALT+String(p.status||'')+String(p.total_amount||'')
    );
    if (!safeEqual(calc,p.hash)) { res.statusCode=400; return res.end('BAD HASH'); }

    const order=await readJsonBlob(orderPath(p.callback_id));
    if (!order) { res.statusCode=404; return res.end('ORDER NOT FOUND'); }
    if (order.status==='paid') { res.statusCode=200; return res.end('OK'); }

    if (String(p.merchant_id||'')!==String(process.env.PAYTR_MERCHANT_ID||'')) {
      res.statusCode=400; return res.end('BAD MERCHANT');
    }
    if (String(p.payment_amount||'')!==String(order.expected_payment_amount)) {
      res.statusCode=400; return res.end('BAD AMOUNT');
    }
    if (p.status==='success') {
      order.status='paid';
      order.paid_at=new Date().toISOString();
      order.merchant_oid=p.merchant_oid||null;
      order.total_amount=p.total_amount||null;
      order.payment_amount=p.payment_amount||null;
      order.payment_type=p.payment_type||null;
      order.test_mode=p.test_mode||null;
      await writeJsonBlob(orderPath(p.callback_id),order);
    }
    res.statusCode=200; res.setHeader('Content-Type','text/plain; charset=utf-8'); return res.end('OK');
  } catch(e) {
    res.statusCode=500; return res.end('ERROR');
  }
}
