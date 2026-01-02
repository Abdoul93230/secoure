const cloudinary = require("cloudinary").v2;
const CLOUDINARY_CLOUD_NAME= process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY= process.env.CLOUDINARY_API_KEY
const CLOUDINARY_API_SECRET= process.env.CLOUDINARY_API_SECRET
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME || 'drjxb4v5t',
  api_key: CLOUDINARY_API_KEY || '373429179689279',
  api_secret: CLOUDINARY_API_SECRET || 'iYGUtrI9dMQiDJVdh808nmUmwmM',
});

module.exports = cloudinary;
