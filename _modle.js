import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  verificationCodeExpires: { type: Date },
  wallet: { balance: { type: Number, default: 0 }, currency: { type: String, default: 'NGN' } },
  virtualAccount: {
    accountNumber: { type: String, default: null },
    bankName: { type: String, default: null },
    bankCode: { type: String, default: null },
    provider: { type: String, default: null }
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'inactive'], default: 'active' },
  transactions: [{
    type: { type: String, enum: ['data', 'otp', 'funding', 'refund'] },
    service: String,
    details: String,
    amount: Number,
    status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'] },
    reference: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.verificationCode;
  delete user.verificationCodeExpires;
  return user;
};

const settingsSchema = new mongoose.Schema({
  dataFlatMarkup: { type: Number, default: 20 },
  otpMinProfit: { type: Number, default: 1500 },
  otpMaxProfit: { type: Number, default: 3000 },
  clubKonnectUserId: { type: String, default: 'CK101283053' },
  clubKonnectApiKey: { type: String, default: '' },
  fiveSimApiKey: { type: String, default: '' },
  systemStatus: { type: String, enum: ['active', 'maintenance', 'down'], default: 'active' },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const dataOrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  network: { type: String, required: true },
  planName: { type: String, required: true },
  planId: { type: String },
  phoneNumber: { type: String, required: true },
  apiCost: { type: Number },
  sellingPrice: { type: Number },
  profit: { type: Number },
  apiReference: { type: String },
  apiResponse: { type: Object },
  status: { type: String, enum: ['pending', 'processing', 'success', 'failed', 'refunded'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const otpOrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String, required: true, unique: true },
  phone: { type: String },
  country: { type: String, required: true },
  countryCode: { type: String },
  app: { type: String, required: true },
  costPrice: { type: Number },
  sellingPrice: { type: Number },
  profit: { type: Number },
  status: { type: String, enum: ['pending', 'active', 'sms_received', 'timeout', 'cancelled', 'completed', 'refunded'], default: 'pending' },
  smsCode: { type: String },
  smsText: { type: String },
  smsReceivedAt: { type: Date },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
export const DataOrder = mongoose.models.DataOrder || mongoose.model('DataOrder', dataOrderSchema);
export const OTPOrder = mongoose.models.OTPOrder || mongoose.model('OTPOrder', otpOrderSchema);