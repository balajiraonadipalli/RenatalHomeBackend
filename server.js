const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const connectDB = require('./config/database');
require('dotenv').config();

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// CORS - Allow all origins in development for mobile app compatibility
const SYSTEM_IP = process.env.SYSTEM_IP || '10.91.255.6';

const corsOptions = {
  origin: [
    'http://localhost:19006',    // Expo web
    'http://localhost:19000',    // Expo dev server
    'http://localhost:8081',     // Metro bundler default
    'http://localhost:8082',     // Metro bundler alternate
    'http://localhost:3000',     // React web
    'http://10.0.2.2:19006',     // Android emulator
    'http://10.0.2.2:19000',     // Android emulator Expo
    'http://10.0.2.2:8081',      // Android emulator Metro
    'http://10.0.2.2:8082',      // Android emulator Metro alternate
    'http://10.0.2.2:3000',      // Android emulator alternative
    'http://10.0.2.2:5000',      // Android emulator backend access
    `http://${SYSTEM_IP}:19006`, // Physical device - Expo web
    `http://${SYSTEM_IP}:19000`, // Physical device - Expo dev
    `http://${SYSTEM_IP}:8081`,  // Physical device - Metro
    `http://${SYSTEM_IP}:8082`,  // Physical device - Metro alternate
    `http://${SYSTEM_IP}:3000`,  // Physical device - Alternative port
    `http://${SYSTEM_IP}:5000`,  // Physical device - Backend access
    'http://localhost:5000',     // Direct backend access
  ],
  credentials: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Only use these in production
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
  app.use(compression());
}

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // Simpler logs in development
} else {
  app.use(morgan('combined'));
}

// Serve static files (uploaded images)
app.use('/uploads', express.static('uploads'));

// Log all incoming requests in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
    next();
  });
}

// Routes - Only include routes that are actually used by the frontend
app.use('/api/auth', require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/bookings', require('./routes/bookings'));

// Commented out unused routes - uncomment if needed in the future
// app.use('/api/users', require('./routes/users'));
// app.use('/api/posts', require('./routes/posts'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
