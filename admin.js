import { connectDB } from './_db.js';
import { User, Settings, DataOrder, OTPOrder } from './_models.js';
import { setCors, handleOptions, getUserFromToken } from './_utils.js';

export default async function handler(req, res) {
  await connectDB();
  setCors(res);
  
  if (req.method === 'OPTIONS') return handleOptions(res);
  
  const user = await getUserFromToken(req, User);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  try {
    if (req.method === 'GET' && req.query.action === 'stats') {
      const totalUsers = await User.countDocuments({ role: 'user' });
      const totalTx = await DataOrder.countDocuments() + await OTPOrder.countDocuments();
      
      const dataRev = await DataOrder.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, total: { $sum: '$sellingPrice' } } }
      ]);
      const otpRev = await OTPOrder.aggregate([
        { $match: { status: { $in: ['active', 'sms_received', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$sellingPrice' } } }
      ]);
      
      const totalRevenue = (dataRev[0]?.total || 0) + (otpRev[0]?.total || 0);
      
      const dataProfit = await DataOrder.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, total: { $sum: '$profit' } } }
      ]);
      const otpProfit = await OTPOrder.aggregate([
        { $match: { status: { $in: ['active', 'sms_received', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$profit' } } }
      ]);
      
      const totalProfit = (dataProfit[0]?.total || 0) + (otpProfit[0]?.total || 0);
      
      const recentData = await DataOrder.find().populate('user', 'email fullname').sort({ createdAt: -1 }).limit(5);
      const recentOTP = await OTPOrder.find().populate('user', 'email fullname').sort({ createdAt: -1 }).limit(5);
      
      const recentActivity = [...recentData, ...recentOTP]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10)
        .map(item => ({
          user: item.user?.email || 'Unknown',
          service: item.network ? 'Data' : 'Number',
          details: item.network ? `${item.network} ${item.planName}` : `${item.country} ${item.app}`,
          amount: item.sellingPrice,
          profit: item.profit,
          createdAt: item.createdAt
        }));
      
      return res.status(200).json({
        success: true,
        stats: { totalRevenue, totalUsers, totalTransactions: totalTx, totalProfit },
        recentActivity
      });
    }
    
    if (req.method === 'GET' && req.query.action === 'users') {
      const users = await User.find({ role: 'user' })
        .select('-password -verificationCode -verificationCodeExpires')
        .sort({ createdAt: -1 });
      return res.status(200).json({ success: true, count: users.length, users });
    }
    
    if (req.method === 'PATCH' && req.query.action === 'user-status') {
      const { userId, status } = req.body;
      const updated = await User.findByIdAndUpdate(userId, { status }, { new: true })
        .select('-password -verificationCode -verificationCodeExpires');
      if (!updated) return res.status(404).json({ success: false, message: 'User not found' });
      return res.status(200).json({ success: true, message: `User ${status}`, user: updated });
    }
    
    if (req.method === 'GET' && req.query.action === 'settings') {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = await Settings.create({
          dataFlatMarkup: parseInt(process.env.DATA_FLAT_MARKUP) || 20,
          otpMinProfit: parseInt(process.env.OTP_MIN_PROFIT) || 1500,
          otpMaxProfit: parseInt(process.env.OTP_MAX_PROFIT) || 3000,
          clubKonnectUserId: process.env.CLUBKONNECT_USERID,
          clubKonnectApiKey: process.env.CLUBKONNECT_API_KEY,
          fiveSimApiKey: process.env.FIVESIM_API_KEY
        });
      }
      return res.status(200).json({
        success: true,
        settings: {
          dataFlatMarkup: settings.dataFlatMarkup,
          otpMinProfit: settings.otpMinProfit,
          otpMaxProfit: settings.otpMaxProfit,
          clubKonnectUserId: settings.clubKonnectUserId,
          clubKonnectApiKeyMasked: settings.clubKonnectApiKey ? '****' + settings.clubKonnectApiKey.slice(-4) : '',
          fiveSimApiKeyMasked: settings.fiveSimApiKey ? '****' + settings.fiveSimApiKey.slice(-4) : ''
        }
      });
    }
    
    if (req.method === 'PUT' && req.query.action === 'data-pricing') {
      const { dataFlatMarkup } = req.body;
      if (typeof dataFlatMarkup !== 'number' || dataFlatMarkup < 0) {
        return res.status(400).json({ success: false, message: 'Invalid markup' });
      }
      let settings = await Settings.findOne();
      if (!settings) settings = new Settings();
      settings.dataFlatMarkup = dataFlatMarkup;
      settings.updatedAt = new Date();
      settings.updatedBy = user._id;
      await settings.save();
      return res.status(200).json({ success: true, message: 'Data pricing updated', dataFlatMarkup });
    }
    
    if (req.method === 'PUT' && req.query.action === 'otp-pricing') {
      const { otpMinProfit, otpMaxProfit } = req.body;
      if (typeof otpMinProfit !== 'number' || typeof otpMaxProfit !== 'number') {
        return res.status(400).json({ success: false, message: 'Invalid profit values' });
      }
      let settings = await Settings.findOne();
      if (!settings) settings = new Settings();
      settings.otpMinProfit = otpMinProfit;
      settings.otpMaxProfit = otpMaxProfit;
      settings.updatedAt = new Date();
      settings.updatedBy = user._id;
      await settings.save();
      return res.status(200).json({ success: true, message: 'OTP pricing updated', otpMinProfit, otpMaxProfit });
    }
    
    if (req.method === 'PUT' && req.query.action === 'api-keys') {
      const { clubKonnectApiKey, fiveSimApiKey } = req.body;
      let settings = await Settings.findOne();
      if (!settings) settings = new Settings();
      if (clubKonnectApiKey) settings.clubKonnectApiKey = clubKonnectApiKey;
      if (fiveSimApiKey) settings.fiveSimApiKey = fiveSimApiKey;
      settings.updatedAt = new Date();
      settings.updatedBy = user._id;
      await settings.save();
      return res.status(200).json({ success: true, message: 'API keys updated' });
    }
    
    if (req.method === 'GET' && req.query.action === 'data-orders') {
      const orders = await DataOrder.find().populate('user', 'email fullname').sort({ createdAt: -1 }).limit(100);
      return res.status(200).json({ success: true, orders });
    }
    
    if (req.method === 'GET' && req.query.action === 'otp-orders') {
      const orders = await OTPOrder.find().populate('user', 'email fullname').sort({ createdAt: -1 }).limit(100);
      return res.status(200).json({ success: true, orders });
    }
    
    return res.status(405).json({ success: false, message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Admin error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}