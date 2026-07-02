import { connectDB } from './_db.js';
import { User, DataOrder, Settings } from './_models.js';
import { setCors, handleOptions, getUserFromToken, FALLBACK_DATA } from './_utils.js';
import axios from 'axios';

export default async function handler(req, res) {
  await connectDB();
  setCors(res);
  
  if (req.method === 'OPTIONS') return handleOptions(res);
  
  try {
    if (req.method === 'GET' && req.query.action === 'plans') {
      const settings = await Settings.findOne() || { dataFlatMarkup: 20 };
      const markup = settings.dataFlatMarkup || 20;
      
      let plans;
      try {
        const response = await axios.get(`${process.env.CLUBKONNECT_BASE_URL}/dataplans`, {
          params: { UserID: process.env.CLUBKONNECT_USERID, APIKey: process.env.CLUBKONNECT_API_KEY },
          timeout: 5000
        });
        plans = response.data;
      } catch (apiErr) {
        console.log('ClubKonnect down, using fallback');
        plans = FALLBACK_DATA;
      }
      
      const processed = {};
      for (const [net, netPlans] of Object.entries(plans)) {
        processed[net] = netPlans.map(p => ({
          ...p,
          sellingPrice: Math.ceil((p.a || p.apiCost || 0) + markup)
        }));
      }
      
      return res.status(200).json({ success: true, markup, plans: processed });
    }
    
    if (req.method === 'POST' && req.body.action === 'buy') {
      const user = await getUserFromToken(req, User);
      if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
      
      const { network, planId, planName, apiCost, sellingPrice, phoneNumber } = req.body;
      
      if (!network || !planName || !phoneNumber) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }
      
      if (user.wallet.balance < sellingPrice) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      
      user.wallet.balance -= sellingPrice;
      
      const order = await DataOrder.create({
        user: user._id,
        network,
        planName,
        planId,
        phoneNumber,
        apiCost,
        sellingPrice,
        profit: sellingPrice - apiCost,
        status: 'processing'
      });
      
      try {
        const apiRes = await axios.post(`${process.env.CLUBKONNECT_BASE_URL}/buydata`, {
          UserID: process.env.CLUBKONNECT_USERID,
          APIKey: process.env.CLUBKONNECT_API_KEY,
          Network: network,
          PlanID: planId,
          PhoneNumber: phoneNumber
        }, { timeout: 10000 });
        
        order.status = 'success';
        order.apiReference = apiRes.data.reference || apiRes.data.id;
        order.apiResponse = apiRes.data;
        await order.save();
        
        user.transactions.push({
          type: 'data',
          service: `${network} Data`,
          details: `${planName} → ${phoneNumber}`,
          amount: sellingPrice,
          status: 'success',
          reference: order._id.toString()
        });
        
      } catch (apiErr) {
        console.error('ClubKonnect buy error:', apiErr.message);
        
        user.wallet.balance += sellingPrice;
        order.status = 'failed';
        order.apiResponse = { error: apiErr.message };
        await order.save();
        
        user.transactions.push({
          type: 'data',
          service: `${network} Data`,
          details: `${planName} → ${phoneNumber}`,
          amount: sellingPrice,
          status: 'failed',
          reference: order._id.toString()
        });
        await user.save();
        
        return res.status(500).json({
          success: false,
          message: 'Data purchase failed. Wallet refunded.',
          newBalance: user.wallet.balance
        });
      }
      
      await user.save();
      
      return res.status(200).json({
        success: true,
        message: 'Data purchased successfully',
        order: { id: order._id, network, planName, phoneNumber, status: order.status },
        newBalance: user.wallet.balance
      });
    }
    
    if (req.method === 'GET' && req.query.action === 'orders') {
      const user = await getUserFromToken(req, User);
      if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
      
      const orders = await DataOrder.find({ user: user._id }).sort({ createdAt: -1 }).limit(50);
      return res.status(200).json({ success: true, orders });
    }
    
    return res.status(405).json({ success: false, message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Data error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}