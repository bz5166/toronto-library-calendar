require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

console.log('🚀 Starting server...');

const app = express();
const PORT = process.env.PORT || 3000;

// Add error handling for missing files
let eventRoutes;
try {
  eventRoutes = require('./routes/events');
  console.log('✅ Routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading routes:', error.message);
  // Create a simple fallback route
  eventRoutes = require('express').Router();
  eventRoutes.get('/', (req, res) => res.json({ message: 'Routes not configured yet' }));
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Set view engine only if views directory exists
try {
  app.set('view engine', 'ejs');
  console.log('✅ EJS view engine set');
} catch (error) {
  console.error('❌ Error setting view engine:', error.message);
}

// Connect to MongoDB with better error handling
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/library-events';
console.log('🔌 Connecting to MongoDB...');

mongoose.connect(mongoUri)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('💡 Continuing without database (some features will be limited)');
  });

// Routes
app.use('/api/events', eventRoutes);

// Add this after your existing routes
const { SitemapStream, streamToPromise } = require('sitemap');

// Sitemap route
app.get('/sitemap.xml', async (req, res) => {
  try {
    res.header('Content-Type', 'application/xml');

    const sitemap = new SitemapStream({ hostname: 'https://your-domain.com' });

    // Add your main pages
    sitemap.write({ url: '/', changefreq: 'daily', priority: 1.0 });
    sitemap.write({ url: '/calendar', changefreq: 'daily', priority: 0.9 });
    sitemap.write({ url: '/map', changefreq: 'daily', priority: 0.9 });
    
    sitemap.end();

    // Convert to string and send
    const xml = await streamToPromise(sitemap);
    res.send(xml.toString());
  } catch (error) {
    console.error('Sitemap error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Library Programs App is running!',
    timestamp: new Date().toISOString() 
  });
});

// Simple home route (fallback if views don't work)
app.get('/', (req, res) => {
  try {
    res.render('index');
  } catch (error) {
    console.error('❌ Error rendering view:', error.message);
    res.send(`
      <h1>🏛️ Toronto Public Library Programs Calendar</h1>
      <p>Server is running! Views not configured yet.</p>
      <p><a href="/health">Health Check</a></p>
      <p><a href="/api/events">API Events</a></p>
    `);
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Library Event App running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api/events`);
  console.log(`🔄 Health check at http://localhost:${PORT}/health`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.log(`💡 Port ${PORT} is already in use. Try PORT=3001 in your .env file`);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});