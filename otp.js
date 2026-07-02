import { connectDB } from './_db.js';
import { User, OTPOrder, Settings } from './_models.js';
import { setCors, handleOptions, getUserFromToken, OTP_COUNTRIES, OTP_APPS, calcOTPPrice } from './_utils.js';
import axios from 'axios';

export default async function handler(req, res) {
  await connectDB();
  setCors(res);
  
  if (req.method === 'OPTIONS') return handleOptions(res);
  
  try {
    if (req.method === 'GET' && req.query.action === 'countries') {
      return res.status(200).json({ success: true, countries: OTP_COUNTRIES });
    }
    
    if (req.method === 'GET' && req.query.action === 'apps') {
      return res.status(200).json({ success: true, apps: OTP_APPS });
    }
    
    if (req.method === 'POST' && req.body.action === 'price') {
      const { country, app } = req.body;
      const settings = await Settings.findOne() || {};
      const result = calcOTPPrice(country, app, settings.otpMinProfit, settings.otpMaxProfit);
      return res.status(200).json({ success: true, ...result, country, app });
    }
    
    if (req.method === 'POST' && req.body.action === 'rent') {
      const user = await getUserFromToken(req, User);
      if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
      
      const { country, app, price } = req.body;
      
      if (user.wallet.balance < price) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      
      user.wallet.balance -= price;
      
      let fiveSimOrder;
      try {
        const countryCode = country.toLowerCase().replace(/ /g, '_');
        const appCode = app.toLowerCase().replace(/ \/ /g, '_').replace(/ /g, '_');
        
        const response = await axios.get(
          `${process.env.FIVESIM_BASE_URL}/user/buy/activation/${countryCode}/any/${appCode}`,
          { headers: { Authorization: `Bearer ${process.env.FIVESIM_API_KEY}` }, timeout: 10000 }
        );
        fiveSimOrder = response.data;
      } catch (apiErr) {
        user.wallet.balance += price;
        await user.save();
        return res.status(500).json({
          success: false,
          message: 'Failed to rent number. Wallet refunded.',
          error: apiErr.message
        });
      }
      
      const order = await OTPOrder.create({
        user: user._id,
        orderId: fiveSimOrder.id,
        phone: fiveSimOrder.phone,
        country,
        countryCode: fiveSimOrder.country,
        app,
        costPrice: fiveSimOrder.price || price * 0.7,
        sellingPrice: price,
        profit: price - (fiveSimOrder.price || price * 0.7),
        status: 'active',
        expiresAt: new Date(Date.now() + 20 * 60 * 1000)
      });
      
      user.transactions.push({
        type: 'otp',
        service: `${country} Number`,
        details: `${app} verification`,
        amount: price,
        status: 'success',
        reference: order._id.toString()
      });
      await user.save();
      
      return res.status(200).json({
        success: true,
        message: 'Number rented successfully',
        order: {
          id: order._id,
          orderId: order.orderId,
          phone: order.phone,
          country,
          app,
          status: order.status,
          expiresAt: order.expiresAt
        },
        newBalance: user.wallet.balance
      });
    }
    
    if (req.method === 'GET' && req.query.action === 'sms') {
      const user = await getUserFromToken(req, User);
      if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
      
      const { orderId } = req.query;
      const order = await OTPOrder.findOne({ orderId, user: user._id });
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      
      try {
        const response = await axios.get(
          `${process.env.FIVESIM_BASE_URL}/user/check/${orderId}`,
          { headers: { Authorization: `Bearer ${process.env.FIVESIM_API_KEY}` }, timeout: 5000 }
        );
        const smsData = response.data;
        
        if (smsData.status === 'RECEIVED' || smsData.sms) {
          order.status = 'sms_received';
          order.smsCode = smsData.sms?.code || null;
          order.smsText = smsData.sms?.text || null;
          order.smsReceivedAt = new Date();
          await order.save();
        }
      } catch (apiErr) {
        // Ignore API errors
      }
      
      if (new Date() > order.expiresAt && order.status !== 'sms_received') {
        order.status = 'timeout';
        await order.save();
        
        user.wallet.balance += order.sellingPrice;
        user.transactions.push({
          type: 'refund',
          service: 'OTP Refund',
          details: `${order.country} ${order.app} - No SMS received`,
          amount: order.sellingPrice,
          status: 'success',
          reference: order._id.toString()
        });
        await user.save();
      }
      
      return res.status(200).json({
        success: true,
        order: {
          id: order._id,
          orderId: order.orderId,
          phone: order.phone,
          status: order.status,
          smsCode: order.smsCode,
          smsText: order.smsText,
          smsReceivedAt: order.smsReceivedAt,
          expiresAt: order.expiresAt
        }
      });
    }
    
    if (req.method === 'GET' && req.query.action === 'orders') {
      const user = await getUserFromToken(req, User);
      if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
      
      const orders = await OTPOrder.find({ user: user._id }).sort({ createdAt: -1 }).limit(50);
      return res.status(200).json({ success: true, orders });
    }
    
    return res.status(405).json({ success: false, message: 'Method not allowed' });
    
  } catch (error) {
    console.error('OTP error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}