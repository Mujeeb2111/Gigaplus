import { connectDB } from './_db.js';
import { setCors, handleOptions } from './_utils.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return handleOptions(res);
  
  try {
    await connectDB();
    return res.status(200).json({
      success: true,
      message: 'Gigaplug API is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}