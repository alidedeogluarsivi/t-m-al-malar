export default function handler(req,res){
  res.statusCode=200;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok:true,
    payment_provider:'PAYTR',
    paytr_configured:Boolean(process.env.PAYTR_MERCHANT_ID&&process.env.PAYTR_MERCHANT_KEY&&process.env.PAYTR_MERCHANT_SALT),
    blob_configured:Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  }));
}
