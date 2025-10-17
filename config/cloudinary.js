const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Check if Cloudinary is configured
const isCloudinaryConfigured = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  
  return cloudName && apiKey && apiSecret && 
         cloudName !== 'your_cloud_name' && 
         apiKey !== 'your_api_key' && 
         apiSecret !== 'your_api_secret';
};

const USE_CLOUDINARY = isCloudinaryConfigured();

console.log('🖼️  Image Storage:', USE_CLOUDINARY ? 'Cloudinary (Cloud)' : 'Local Storage');

let storage;
let upload;

if (USE_CLOUDINARY) {
  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Configure Cloudinary storage for multer
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'property-rental/properties',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
    },
  });

  upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  });
} else {
  // Fallback to local storage
  console.log('⚠️  Using local storage - Configure Cloudinary for production!');
  
  const uploadsDir = path.join(__dirname, '../uploads/properties');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'property-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  });
}

module.exports = { cloudinary: USE_CLOUDINARY ? cloudinary : null, upload, USE_CLOUDINARY };

