import { connectDB } from './_db.js';
import { User } from './_models.js';
import { setCors, handleOptions, getUserFromToken } from './_utils.js';

export default async function handler(req, res) {
  await connectDB();
  setCors(res);
  
  if (req.method === 'OPTIONS') return handleOptions(res);
  
  const user = await getUserFromToken(req, User);
  if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
  
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        balance: user.wallet.balance,
        virtualAccount: user.virtualAccount,
        transactions: user.transactions.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
      });
    }
    
    if (req.method === 'POST' && req.body.action === 'create-account') {
      if (user.virtualAccount && user.virtualAccount.accountNumber) {
        return res.status(200).json({ success: true, virtualAccount: user.virtualAccount });
      }
      
      const mockAccount = '7081' + Math.floor(100000 + Math.random() * 900000).toString();
      user.virtualAccount = { accountNumber: mockAccount, bankName: 'Wema Bank', bankCode: '035', provider: 'placeholder' };
      await user.save();
      
      return res.status(200).json({ success: true, virtualAccount: user.virtualAccount });
    }
    
    return res.status(405).json({ success: false, message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Wallet error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}