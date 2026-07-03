import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

export function generateToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export async function getUserFromToken(req, User) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.split(' ')[1];
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);
    if (!user || user.status === 'suspended') return null;
    return user;
  } catch {
    return null;
  }
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT == '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationEmail(email, code, fullname) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Verify Your Gigaplug Account',
    html: `<div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#070b1a;color:#e8ecff;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#5b7cff;font-family:'Sora',sans-serif;margin:0;">Gigaplug</h1></div>
      <h2 style="color:#fff;font-size:22px;margin-bottom:12px;">Hello ${fullname},</h2>
      <p style="color:#9aa6d6;font-size:16px;line-height:1.6;margin-bottom:24px;">Welcome to Gigaplug! Use this code to verify your email:</p>
      <div style="background:linear-gradient(120deg,#5b7cff,#8a5cff);padding:20px;border-radius:12px;text-align:center;margin-bottom:24px;">
        <span style="font-family:'Sora',sans-serif;font-size:36px;font-weight:800;color:#fff;letter-spacing:8px;">${code}</span>
      </div>
      <p style="color:#9aa6d6;font-size:14px;">This code expires in <strong style="color:#1fd1a5;">15 minutes</strong>.</p>
    </div>`
  });
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handleOptions(res) {
  setCors(res);
  return res.status(200).end();
}

export function fmt(n) {
  return '₦' + Number(n).toLocaleString('en-NG');
}

export const FALLBACK_DATA = {
  "MTN": [{n:"500 MB - Weekly (SME)", a:307},{n:"1 GB - Monthly (SME)", a:563},{n:"2 GB - Monthly (SME)", a:1117},{n:"5 GB - Monthly (SME)", a:2511},{n:"1GB Daily (Awoof)", a:485},{n:"10GB Monthly (Direct)", a:4365}],
  "Glo": [{n:"1 GB - 30d (SME)", a:461},{n:"5 GB - 30d (SME)", a:2306},{n:"10GB - 30d (Direct)", a:2910}],
  "9mobile": [{n:"1 GB - 30d (SME)", a:492},{n:"5 GB - 30d (SME)", a:2460}],
  "Airtel": [{n:"1GB - 7d (Direct)", a:776},{n:"3GB - 30d (Direct)", a:1940},{n:"10GB - 30d (Direct)", a:3880}]
};

export const OTP_COUNTRIES = [
  {n:"Nigeria",f:"🇳🇬",c:200},{n:"Germany",f:"🇩🇪",c:1000},{n:"United Kingdom",f:"🇬🇧",c:600},{n:"USA",f:"🇺🇸",c:700},{n:"India",f:"🇮🇳",c:150},{n:"Russia",f:"🇷🇺",c:220},
  {n:"Canada",f:"🇨🇦",c:650},{n:"Australia",f:"🇦🇺",c:600},{n:"Brazil",f:"🇧🇷",c:250},{n:"South Africa",f:"🇿🇦",c:300},{n:"France",f:"🇫🇷",c:800},{n:"Italy",f:"🇮🇹",c:750},
  {n:"Spain",f:"🇪🇸",c:700},{n:"Netherlands",f:"🇳🇱",c:750},{n:"Sweden",f:"🇸🇪",c:800},{n:"Switzerland",f:"🇨🇭",c:900},{n:"Japan",f:"🇯🇵",c:850},{n:"South Korea",f:"🇰🇷",c:800},
  {n:"China",f:"🇨🇳",c:300},{n:"Indonesia",f:"🇮🇩",c:180},{n:"Malaysia",f:"🇲🇾",c:250},{n:"Philippines",f:"🇵🇭",c:200},{n:"Vietnam",f:"🇻🇳",c:180},{n:"Thailand",f:"🇹🇭",c:220},
  {n:"Egypt",f:"🇪🇬",c:200},{n:"Kenya",f:"🇰🇪",c:250},{n:"Ghana",f:"🇬🇭",c:220},{n:"Argentina",f:"🇦🇷",c:280},{n:"Mexico",f:"🇲🇽",c:300},{n:"Colombia",f:"🇨🇴",c:250}
];

export const OTP_APPS = [
  "WhatsApp","Telegram","Facebook","Instagram","Google / Gmail","TikTok","Twitter / X",
  "Tinder","Snapchat","Discord","Netflix","Amazon","Uber","Bolt","Apple","Microsoft",
  "Yahoo","LinkedIn","Viber","Line","WeChat","Signal","PayPal","CashApp","Binance",
  "ChatGPT","Claude","Alipay","Taobao","Shopee"
];

export function calcOTPPrice(countryName, appName, minProfit, maxProfit) {
  const country = OTP_COUNTRIES.find(c => c.n === countryName) || OTP_COUNTRIES[0];
  const cost = country.c + (appName.length * 10);
  
  if (countryName === 'Germany' && appName === 'WhatsApp') {
    return { price: 5000, cost, profit: 5000 - cost, tiers: [
      {label:'₦5,000',oos:true},{label:'₦10,000',oos:false},{label:'₦15,000',oos:false}
    ]};
  }
  
  let profit = minProfit || 1500;
  if (cost > 500) profit = 2000;
  if (cost > 1000) profit = maxProfit || 3000;
  
  if (cost <= 300) return { price: 1500, cost, profit: 1500 - cost, tiers: null };
  
  return { price: cost + profit, cost, profit, tiers: null };
}