import { connectDB } from './_db.js';
import { User } from './_models.js';
import { setCors, handleOptions } from './_utils.js';

export default async function handler(req, res) {
  await connectDB();
  setCors(res);
  
  if (req.method === 'OPTIONS') return handleOptions(res);
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  
  try {
    const { event, data } = req.body;
    
    if (event === 'payment.success' || event === 'charge.completed') {
      const { accountNumber, amount, paymentReference } = data;
      
      const user = await User.findOne({ 'virtualAccount.accountNumber': accountNumber });
      if (!user) {
        console.error('Webhook: User not found for account', accountNumber);
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      const existing = user.transactions.find(t => t.reference === paymentReference);
      if (existing) {
        return res.status(200).json({ success: true, message: 'Duplicate ignored' });
      }
      
      user.wallet.balance += parseFloat(amount);
      user.transactions.push({
        type: 'funding',
        service: 'Bank Transfer',
        details: `Transfer to ${accountNumber}`,
        amount: parseFloat(amount),
        status: 'success',
        reference: paymentReference
      });
      await user.save();
      
      console.log(`Wallet funded: ${user.email} +₦${amount}`);
      return res.status(200).json({ success: true, message: 'Wallet credited' });
    }
    
    return res.status(200).json({ success: true, message: 'Webhook received' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}