import { connectDB } from './_db.js';
import { User } from './_models.js';
import { generateToken, generateCode, sendVerificationEmail, setCors, handleOptions, getUserFromToken } from './_utils.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  await connectDB();
  setCors(res);
  
  if (req.method === 'OPTIONS') return handleOptions(res);
  
  try {
    // POST /api/auth - register
    if (req.method === 'POST' && req.body.action === 'register') {
      const { fullname, email, password, phone } = req.body;
      
      if (!fullname || !email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide all required fields' });
      }
      
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
      
      const code = generateCode();
      const codeExpires = new Date(Date.now() + 15 * 60 * 1000);
      
      const user = await User.create({
        fullname,
        email: email.toLowerCase(),
        password,
        phone,
        isVerified: false,
        verificationCode: code,
        verificationCodeExpires: codeExpires
      });
      
      await sendVerificationEmail(email, code, fullname);
      
      return res.status(200).json({
        success: true,
        message: 'Verification code sent to your email',
        userId: user._id
      });
    }
    
    // POST /api/auth - verify email
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userId, code } = req.body;
      
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (user.isVerified) return res.status(400).json({ success: false, message: 'Already verified' });
      if (user.verificationCode !== code) return res.status(400).json({ success: false, message: 'Invalid code' });
      if (new Date() > user.verificationCodeExpires) return res.status(400).json({ success: false, message: 'Code expired' });
      
      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      
      const mockAccount = '7081' + Math.floor(100000 + Math.random() * 900000).toString();
      user.virtualAccount = { accountNumber: mockAccount, bankName: 'Wema Bank', bankCode: '035', provider: 'placeholder' };
      await user.save();
      
      const token = generateToken(user._id);
      
      return res.status(200).json({
        success: true,
        message: 'Email verified successfully',
        token,
        user: user.toJSON()
      });
    }
    
    // POST /api/auth - login
    if (req.method === 'POST' && req.body.action === 'login') {
      const { identifier, password } = req.body;
      
      if (!identifier || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password' });
      }
      
      const user = await User.findOne({ email: identifier.toLowerCase() });
      if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      
      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      
      if (!user.isVerified) return res.status(403).json({ success: false, message: 'Please verify your email first' });
      if (user.status === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended' });
      
      const token = generateToken(user._id);
      
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: user.toJSON()
      });
    }
    
    // POST /api/auth - admin login
    if (req.method === 'POST' && req.body.action === 'admin-login') {
      const { identifier, password } = req.body;
      
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminHash = process.env.ADMIN_PASSWORD_HASH;
      
      if (identifier.toLowerCase() !== adminEmail.toLowerCase()) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }
      
      const isMatch = await bcrypt.compare(password, adminHash);
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      
      let adminUser = await User.findOne({ email: adminEmail.toLowerCase() });
      if (!adminUser) {
        adminUser = await User.create({
          fullname: 'Administrator',
          email: adminEmail.toLowerCase(),
          password: password,
          role: 'admin',
          isVerified: true,
          status: 'active'
        });
      }
      
      const token = generateToken(adminUser._id);
      
      return res.status(200).json({
        success: true,
        message: 'Admin login successful',
        token,
        user: adminUser.toJSON(),
        isAdmin: true
      });
    }
    
    // GET /api/auth - get current user
    if (req.method === 'GET') {
      const user = await getUserFromToken(req, User);
      if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
      
      return res.status(200).json({ success: true, user: user.toJSON() });
    }
    
    return res.status(405).json({ success: false, message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}