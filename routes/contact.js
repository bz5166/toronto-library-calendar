const express = require('express');
const router = express.Router();

// Simple in-memory rate limiting (for production, consider using express-rate-limit)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 3; // Max 3 submissions per 15 minutes per IP

// Helper function to sanitize input
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  // Remove HTML tags and trim
  return input.replace(/<[^>]*>/g, '').trim();
}

// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Rate limiting middleware
function rateLimitMiddleware(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Clean old entries
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
  
  const clientData = rateLimitMap.get(clientIp);
  
  if (!clientData) {
    rateLimitMap.set(clientIp, {
      firstRequest: now,
      count: 1
    });
    return next();
  }
  
  if (now - clientData.firstRequest > RATE_LIMIT_WINDOW) {
    // Reset window
    rateLimitMap.set(clientIp, {
      firstRequest: now,
      count: 1
    });
    return next();
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.'
    });
  }
  
  clientData.count++;
  next();
}

// POST /api/contact - Submit contact form
router.post('/', rateLimitMiddleware, async (req, res) => {
  try {
    const { name, email, message, subject } = req.body;
    
    // Validation - only message is required
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required.'
      });
    }
    
    // Sanitize inputs (name and email are optional)
    const sanitizedName = name ? sanitizeInput(name) : '';
    const sanitizedEmail = email ? sanitizeInput(email) : '';
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedSubject = subject ? sanitizeInput(subject) : 'Feedback/Improvement Suggestion';
    
    // Validate name if provided
    if (sanitizedName && (sanitizedName.length < 2 || sanitizedName.length > 100)) {
      return res.status(400).json({
        success: false,
        error: 'Name must be between 2 and 100 characters if provided.'
      });
    }
    
    // Validate email if provided
    if (sanitizedEmail && !isValidEmail(sanitizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address if provided.'
      });
    }
    
    if (sanitizedMessage.length < 10 || sanitizedMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message must be between 10 and 2000 characters.'
      });
    }
    
    // Here you would typically send an email using nodemailer or similar
    // For now, we'll log it and return success
    // You can configure email sending using environment variables
    
    const contactData = {
      name: sanitizedName || 'Anonymous',
      email: sanitizedEmail || 'No email provided',
      subject: sanitizedSubject,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress || 'unknown'
    };
    
    console.log('📧 Contact form submission received:');
    console.log('   Name:', contactData.name);
    console.log('   Email:', contactData.email);
    console.log('   Subject:', contactData.subject);
    console.log('   Message:', contactData.message);
    console.log('   Timestamp:', contactData.timestamp);
    
    // Check if SMTP is configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn('⚠️  SMTP not configured. Email sending skipped.');
      console.warn('   Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.');
      console.warn('   Submission logged above. Email will not be sent.');
      
      // Still return success to user, but log the issue
      return res.json({
        success: true,
        message: 'Thank you for your feedback! We will review your suggestion and get back to you if needed.'
      });
    }
    
    // Send email using nodemailer
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        // Add connection timeout to prevent hanging
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000
      });
      
      await transporter.sendMail({
        from: process.env.SMTP_FROM || smtpUser,
        to: process.env.CONTACT_EMAIL || 'tpleventscalendar@gmail.com',
        subject: `[TPL Programs] ${sanitizedSubject}`,
        text: `
        Name: ${sanitizedName || 'Not provided'}
        Email: ${sanitizedEmail || 'Not provided'}
        Subject: ${sanitizedSubject}
        
        Message:
        ${sanitizedMessage}
        
        ---
        Submitted at: ${contactData.timestamp}
        IP: ${contactData.ip}
      `,
        html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${sanitizedName || '<em>Not provided</em>'}</p>
        <p><strong>Email:</strong> ${sanitizedEmail || '<em>Not provided</em>'}</p>
        <p><strong>Subject:</strong> ${sanitizedSubject}</p>
        <p><strong>Message:</strong></p>
        <p>${sanitizedMessage.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><small>Submitted at: ${contactData.timestamp}<br>IP: ${contactData.ip}</small></p>
      `
      });
      
      console.log('✅ Email sent successfully');
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error('❌ Failed to send email:', emailError.message);
      console.error('   Submission was received but email delivery failed.');
      console.error('   Check SMTP configuration and network connectivity.');
      
      // Still return success to user since submission was received
      // The error is logged for admin review
    }
    
    
    res.json({
      success: true,
      message: 'Thank you for your feedback! We will review your suggestion and get back to you if needed.'
    });
    
  } catch (error) {
    console.error('❌ Contact form error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your request. Please try again later.'
    });
  }
});

module.exports = router;

