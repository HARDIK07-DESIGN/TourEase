require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { GoogleGenAI } = require('@google/genai');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const port = PORT;
const JWT_SECRET = process.env.JWT_SECRET || 'tourease_secret_key_2026';

// In-memory OTP cache with 10-minute TTL for instant fallback
const inMemoryOtpStore = new Map();

// In-memory telemetry cache for live vehicle GPS tracking
const liveTelemetryStore = new Map();

// Email transporter for real verification & security notifications
const mailUserClean = (process.env.GMAIL_USER || process.env.SMTP_USER || '').trim();
const mailPassClean = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();

const emailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  connectionTimeout: 8000,
  auth: {
    user: mailUserClean,
    pass: mailPassClean
  }
});

async function sendNotificationEmail(to, subject, html) {
  if (!mailUserClean || !mailPassClean || mailUserClean.includes('your_gmail') || mailUserClean.includes('your_email')) {
    console.log(`[DEV/LOCAL EMAIL NOTIFICATION] To: ${to} | Subject: ${subject}`);
    return false;
  }
  try {
    const sendPromise = emailTransporter.sendMail({
      from: `"TourEase Security" <${mailUserClean}>`,
      to,
      subject,
      html
    });
    // 8-second timeout so Render never hangs on blocked SMTP ports
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP connection timed out after 8s')), 8000)
    );
    await Promise.race([sendPromise, timeoutPromise]);
    console.log(`[LIVE EMAIL SENT] Successfully delivered email to ${to}`);
    return true;
  } catch (err) {
    console.warn(`[EMAIL DISPATCH NOTICE] ${err.message}. To: ${to}`);
    return false;
  }
}

async function recordAuditLog(userEmail, role, authMethod, action, req) {
  try {
    const rawIp = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : '127.0.0.1';
    const ip = rawIp.toString().split(',')[0].trim();
    await pool.query(
      'INSERT INTO auth_audit_logs (user_email, role, auth_method, action, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [userEmail || 'anonymous', role || 'traveler', authMethod || 'session', action, ip]
    );
    console.log(`[AUTH AUDIT LOG] ${action} | User: ${userEmail || 'anonymous'} | Role: ${role || 'traveler'} | Method: ${authMethod} | IP: ${ip}`);
  } catch (err) {
    console.warn('[AUDIT LOG INSERT ERROR]', err.message);
  }
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static('app/src/main/assets'));

const isLocalDb = !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('localhost') ||
  process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } })
});

pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));

// Initialize Gemini AI SDK
const ai = new GoogleGenAI();

// --- Embedded Production SVG Assets (Stored in PostgreSQL, Zero External Unsplash Dependency) ---
const SUV_THAR_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%"><rect width="600" height="360" fill="#F1F5F9"/><rect x="70" y="140" width="460" height="120" rx="20" fill="#1E293B"/><polygon points="120,140 180,60 410,60 470,140" fill="#334155"/><rect x="190,75" width="95" height="55" rx="6" fill="#93C5FD"/><rect x="300,75" width="100" height="55" rx="6" fill="#93C5FD"/><circle cx="170" cy="260" r="46" fill="#0F172A"/><circle cx="170" cy="260" r="22" fill="#94A3B8"/><circle cx="430" cy="260" r="46" fill="#0F172A"/><circle cx="430" cy="260" r="22" fill="#94A3B8"/><rect x="495" y="110" width="30" height="80" rx="12" fill="#0F172A"/><text x="300" y="335" font-family="sans-serif" font-size="20" font-weight="bold" fill="#475569" text-anchor="middle">MAHINDRA THAR 4x4 (HARD TOP)</text></svg>`);

const EV_NEXON_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%"><rect width="600" height="360" fill="#F0FDFA"/><rect x="60" y="150" width="480" height="110" rx="24" fill="#0F766E"/><path d="M120,150 Q200,65 310,65 Q430,65 480,150 Z" fill="#115E59"/><rect x="200,80" width="100" height="60" rx="8" fill="#99F6E4"/><rect x="315,80" width="105" height="60" rx="8" fill="#99F6E4"/><circle cx="160" cy="260" r="44" fill="#134E4A"/><circle cx="160" cy="260" r="20" fill="#5EEAD4"/><circle cx="440" cy="260" r="44" fill="#134E4A"/><circle cx="440" cy="260" r="20" fill="#5EEAD4"/><text x="300" y="335" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0F766E" text-anchor="middle">TATA NEXON EV MAX (LONG RANGE)</text></svg>`);

const SUV_CRETA_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%"><rect width="600" height="360" fill="#EFF6FF"/><rect x="65" y="145" width="470" height="115" rx="22" fill="#1D4ED8"/><path d="M130,145 L200,70 L400,70 L475,145 Z" fill="#1E40AF"/><rect x="210,82" width="85" height="53" rx="6" fill="#BFDBFE"/><rect x="310,82" width="95" height="53" rx="6" fill="#BFDBFE"/><circle cx="165" cy="260" r="44" fill="#1E3A8A"/><circle cx="165" cy="260" r="20" fill="#93C5FD"/><circle cx="435" cy="260" r="44" fill="#1E3A8A"/><circle cx="435" cy="260" r="20" fill="#93C5FD"/><text x="300" y="335" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1D4ED8" text-anchor="middle">HYUNDAI CRETA SX (O)</text></svg>`);

const TOUR_SPIRITUAL_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%"><defs><linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#D97706"/><stop offset="100%" stop-color="#78350F"/></linearGradient></defs><rect width="800" height="480" fill="url(#spGrad)"/><polygon points="400,80 470,300 330,300" fill="#FDE68A"/><polygon points="400,40 430,90 370,90" fill="#F59E0B"/><polygon points="260,180 310,320 210,320" fill="#FCD34D"/><polygon points="540,180 590,320 490,320" fill="#FCD34D"/><path d="M0,320 Q200,280 400,320 T800,320 L800,480 L0,480 Z" fill="#92400E"/><path d="M0,360 Q200,330 400,360 T800,360 L800,480 L0,480 Z" fill="#451A03"/><text x="400" y="420" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FEF3C7" text-anchor="middle">UJJAIN &bull; OMKARESHWAR JYOTIRLINGA</text><text x="400" y="450" font-family="sans-serif" font-size="18" fill="#FDE68A" text-anchor="middle">Twin Sanctum River Circuit &bull; 2 Days</text></svg>`);

const TOUR_FOOD_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%"><defs><linearGradient id="fdGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#DC2626"/><stop offset="100%" stop-color="#991B1B"/></linearGradient></defs><rect width="800" height="480" fill="url(#fdGrad)"/><rect x="250" y="100" width="300" height="240" rx="16" fill="#FEE2E2"/><polygon points="230,100 400,30 570,100" fill="#FEF2F2"/><rect x="280" y="140" width="60" height="90" rx="8" fill="#EF4444"/><rect x="370" y="140" width="60" height="90" rx="8" fill="#EF4444"/><rect x="460" y="140" width="60" height="90" rx="8" fill="#EF4444"/><circle cx="200" cy="300" r="50" fill="#F59E0B"/><circle cx="600" cy="300" r="50" fill="#F59E0B"/><text x="400" y="400" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" text-anchor="middle">INDORE GOURMET &amp; MIDNIGHT FOOD</text><text x="400" y="435" font-family="sans-serif" font-size="18" fill="#FCA5A5" text-anchor="middle">Chappan Dukan &bull; Sarafa Night Bazaar &bull; 1 Evening</text></svg>`);

const TOUR_HERITAGE_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%"><defs><linearGradient id="hgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0284C7"/><stop offset="100%" stop-color="#0369A1"/></linearGradient></defs><rect width="800" height="480" fill="url(#hgGrad)"/><rect x="180" y="160" width="440" height="160" rx="8" fill="#F0F9FF"/><polygon points="180,160 220,100 260,160" fill="#BAE6FD"/><polygon points="360,160 400,80 440,160" fill="#BAE6FD"/><polygon points="540,160 580,100 620,160" fill="#BAE6FD"/><path d="M0,320 Q200,290 400,320 T800,320 L800,480 L0,480 Z" fill="#0C4A6E"/><text x="400" y="415" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" text-anchor="middle">MALWA HERITAGE &amp; MAHESHWAR FORT</text><text x="400" y="445" font-family="sans-serif" font-size="18" fill="#BAE6FD" text-anchor="middle">Royal Stone Ghats &bull; Handloom Weavers &bull; 1 Day</text></svg>`);

// Initialize tables idempotently
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tour_bookings (
        id SERIAL PRIMARY KEY,
        tracking_code VARCHAR(32) UNIQUE NOT NULL,
        package_title TEXT NOT NULL,
        travel_date TEXT,
        travelers_count INT DEFAULT 1,
        total_amount NUMERIC(10,2) NOT NULL,
        payment_method TEXT DEFAULT 'UPI / Card Online',
        status TEXT DEFAULT 'CONFIRMED',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tour_packages (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT,
        duration_days INT DEFAULT 2,
        price NUMERIC(10,2) NOT NULL,
        category TEXT DEFAULT 'Spiritual & Heritage',
        image_data TEXT,
        stops_json JSONB,
        is_approved BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS custom_ai_packages (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        route_summary TEXT,
        duration_days INT DEFAULT 2,
        budget NUMERIC(10,2) DEFAULT 0,
        itinerary_json JSONB,
        user_consented BOOLEAN DEFAULT FALSE,
        admin_status VARCHAR(24) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cab_rides (
        id SERIAL PRIMARY KEY,
        tracking_code VARCHAR(32) UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        pickup_location TEXT NOT NULL,
        drop_location TEXT NOT NULL,
        pickup_lat DOUBLE PRECISION,
        pickup_lng DOUBLE PRECISION,
        car_model TEXT,
        driver_name TEXT,
        plate_number TEXT,
        fare NUMERIC(10,2) NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        status TEXT DEFAULT 'requested',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rental_bookings (
        id SERIAL PRIMARY KEY,
        tracking_code VARCHAR(32) UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        car_model TEXT NOT NULL,
        plate_number TEXT,
        pickup_location TEXT NOT NULL,
        drop_location TEXT NOT NULL,
        pickup_date TEXT NOT NULL,
        return_date TEXT NOT NULL,
        total_days INT DEFAULT 1,
        total_amount NUMERIC(10,2) NOT NULL,
        handover_status TEXT DEFAULT 'awaiting_handover',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rental_fleet (
        id SERIAL PRIMARY KEY,
        car_model TEXT NOT NULL,
        plate_number VARCHAR(32) UNIQUE NOT NULL,
        model_year INT NOT NULL,
        daily_rate NUMERIC(10,2) NOT NULL,
        seats INT DEFAULT 5,
        transmission TEXT DEFAULT 'Automatic',
        image_url TEXT,
        image_data TEXT,
        is_compliant BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_accounts (
        role VARCHAR(32) PRIMARY KEY,
        total_balance NUMERIC(10,2) DEFAULT 0,
        withdrawable_balance NUMERIC(10,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(32) NOT NULL,
        tx_type TEXT NOT NULL,
        label TEXT NOT NULL,
        gross_amount NUMERIC(10,2) DEFAULT 0,
        commission_amount NUMERIC(10,2) DEFAULT 0,
        net_amount NUMERIC(10,2) DEFAULT 0,
        balance_after NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS kyc_profiles (
        role VARCHAR(32) PRIMARY KEY,
        full_name TEXT,
        license_or_gst TEXT,
        vehicle_model TEXT,
        plate_number TEXT,
        model_year INT DEFAULT 2024,
        photo_data TEXT,
        vehicle_photo_data TEXT,
        doc_pdf_name TEXT,
        doc_pdf_data TEXT,
        verified BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bill_dispatches (
        id SERIAL PRIMARY KEY,
        tracking_code TEXT NOT NULL,
        channel VARCHAR(32) NOT NULL,
        recipient TEXT NOT NULL,
        fare_breakdown JSONB,
        dispatched_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS otp_verifications (
        id SERIAL PRIMARY KEY,
        target TEXT NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        purpose VARCHAR(32) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auth_audit_logs (
        id SERIAL PRIMARY KEY,
        user_email TEXT,
        role VARCHAR(32),
        auth_method VARCHAR(32),
        action VARCHAR(16),
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'traveler';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32) DEFAULT 'local';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

      ALTER TABLE kyc_profiles ADD COLUMN IF NOT EXISTS vehicle_photo_data TEXT;
      ALTER TABLE kyc_profiles ADD COLUMN IF NOT EXISTS doc_pdf_name TEXT;
      ALTER TABLE kyc_profiles ADD COLUMN IF NOT EXISTS doc_pdf_data TEXT;
      ALTER TABLE kyc_profiles ADD COLUMN IF NOT EXISTS model_year INT DEFAULT 2024;
      ALTER TABLE kyc_profiles ADD COLUMN IF NOT EXISTS bank_account TEXT;
      ALTER TABLE kyc_profiles ADD COLUMN IF NOT EXISTS ifsc_code TEXT;
      ALTER TABLE rental_fleet ADD COLUMN IF NOT EXISTS image_data TEXT;
      ALTER TABLE rental_fleet ADD COLUMN IF NOT EXISTS verification_status VARCHAR(24) DEFAULT 'APPROVED';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
    `);

    // Ensure package title is updated in DB
    await client.query(`UPDATE tour_packages SET title = 'Ujjain to Omkareshwar Spiritual Circuit' WHERE title ILIKE '%Spiritual Ujjain%Omkareshwar%' OR title ILIKE '%Ujjain%Omkareshwar%'`);

    // Seed pre-planned tour packages if empty
    const pkgCheck = await client.query('SELECT COUNT(*) FROM tour_packages');
    if (parseInt(pkgCheck.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO tour_packages (title, subtitle, duration_days, price, category, image_data, stops_json, is_approved) VALUES
        ('Ujjain to Omkareshwar Spiritual Circuit', 'Sacred twin-Jyotirlinga spiritual journey with VIP temple fast-track darshan & Narmada Ghat boat tour.', 2, 4800.00, 'Spiritual & Pilgrimage', $1, $2, TRUE),
        ('Indore Gourmet & Midnight Street Food Trail', 'Curated gastronomic journey through Indore Clean Street Food hubs featuring iconic regional dishes.', 1, 1650.00, 'Culinary & Culture', $3, $4, TRUE),
        ('Malwa Heritage & Shipra Ghats Expedition', 'Scenic journey bridging ancient river ghats with royal handloom weaver colonies and Maratha fort architecture.', 1, 2400.00, 'Heritage & Art', $5, $6, TRUE)
      `, [
        TOUR_SPIRITUAL_SVG,
        JSON.stringify([
          { time: '05:30 AM', location: 'Mahakaleshwar Gate 4', activity: 'Bhasma Aarti Darshan & Corridor Walk', type: 'temple' },
          { time: '09:00 AM', location: 'Sanwer Highway Rest Area', activity: 'Traditional Poha-Jalebi Breakfast', type: 'refreshment' },
          { time: '01:00 PM', location: 'Indore Bypass Food Plaza', activity: 'Air-conditioned Lunch Break', type: 'food' },
          { time: '05:30 PM', location: 'Omkareshwar Narmada Ghat', activity: 'Evening Aarti & Sanctum Boat Ride', type: 'temple' }
        ]),
        TOUR_FOOD_SVG,
        JSON.stringify([
          { time: '05:00 PM', location: 'Rajwada Palace & Lal Bagh', activity: '7-Storey Holkar Heritage Guided Walk', type: 'heritage' },
          { time: '06:30 PM', location: 'Chappan Dukan (56 Shops)', activity: 'Khopra Patties, Johny Hot Dog & Shikanji', type: 'food' },
          { time: '08:30 PM', location: 'Sarafa Midnight Bazaar', activity: 'Bhutte ka Kees, Flying Dahi Bada & Jalebi', type: 'food' }
        ]),
        TOUR_HERITAGE_SVG,
        JSON.stringify([
          { time: '06:30 AM', location: 'Ram Ghat Banks', activity: 'Sunrise Shipra Snan & Heritage Walk', type: 'culture' },
          { time: '08:45 AM', location: 'Highway Dhaba #12', activity: 'Sanitized Breakfast Pod Stop', type: 'refreshment' },
          { time: '12:30 PM', location: 'Maheshwar Ahilya Fort', activity: 'Royal Palace Architecture & Museum Tour', type: 'heritage' },
          { time: '03:30 PM', location: 'Rehwa Society Handloom', activity: 'Live Handloom Weaving Demonstration', type: 'culture' }
        ])
      ]);
      console.log('Seeded initial tour_packages (3 pre-planned packages)');
    }

    // Seed default rental fleet if empty (Clean Vector SVGs, Zero Unsplash)
    const fleetCheck = await client.query('SELECT COUNT(*) FROM rental_fleet');
    if (parseInt(fleetCheck.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO rental_fleet (car_model, plate_number, model_year, daily_rate, seats, transmission, image_url, image_data, is_compliant) VALUES
        ('Mahindra Thar 4x4 (Hard Top)', 'MP-09-TH-2024', 2024, 3800.00, 4, 'Automatic 4x4', $1, $1, TRUE),
        ('Tata Nexon EV Max', 'MP-09-EV-2023', 2023, 2600.00, 5, 'Electric Drive', $2, $2, TRUE),
        ('Hyundai Creta SX (O)', 'MP-09-CR-2024', 2024, 2900.00, 5, 'Automatic IVT', $3, $3, TRUE)
      `, [SUV_THAR_SVG, EV_NEXON_SVG, SUV_CRETA_SVG]);
      console.log('Seeded initial rental_fleet (3 compliant vehicles with clean vector art)');
    } else {
      // Overwrite any legacy unsplash URLs in rental_fleet with clean vector SVGs
      await client.query(`UPDATE rental_fleet SET image_data = $1, image_url = $1 WHERE car_model ILIKE '%Thar%'`, [SUV_THAR_SVG]);
      await client.query(`UPDATE rental_fleet SET image_data = $1, image_url = $1 WHERE car_model ILIKE '%Nexon%'`, [EV_NEXON_SVG]);
      await client.query(`UPDATE rental_fleet SET image_data = $1, image_url = $1 WHERE car_model ILIKE '%Creta%'`, [SUV_CRETA_SVG]);
    }

    // Seed wallet accounts for cab_owner and rental_vendor
    await client.query(`
      INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance)
      VALUES 
        ('cab_owner', 1500.00, 1000.00),
        ('rental_vendor', 0.00, 0.00)
      ON CONFLICT (role) DO NOTHING;
    `);

    console.log('PostgreSQL schema verified and ready');
  } catch (err) {
    console.error('Database init error:', err.message);
  } finally {
    client.release();
  }
}

initDb();

// Health Check Route
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: true });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: false, error: err.message });
  }
});

// Root Route
app.get('/', (req, res) => {
  res.json({ message: 'TourEase API is running successfully with PostgreSQL!' });
});

// Config Route (Strictly from .env)
app.get('/api/config', (req, res) => {
  res.json({
    mapboxToken: process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    googleClientId: (process.env.GOOGLE_CLIENT_ID || '641997788141-t76ucjc54qh95svlpchribs35q737rec8.apps.googleusercontent.com').trim()
  });
});

// --- Real 3-Method Authentication API (Phone OTP, Email OTP, Google OAuth) ---
app.post('/api/auth/send-phone-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone.toString().trim())) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
  }
  const cleanPhone = phone.toString().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await pool.query(
      'INSERT INTO otp_verifications (target, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [cleanPhone, otp, 'phone_auth', expiresAt]
    );

    let liveSent = false;
    const fastKey = process.env.FAST2SMS_API_KEY;
    if (fastKey && fastKey !== 'your_fast2sms_api_key_here') {
      try {
        const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            'authorization': fastKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            variables_values: otp,
            route: 'otp',
            numbers: cleanPhone
          })
        });
        const d = await resp.json();
        if (d && d.return) liveSent = true;
      } catch (smsErr) {
        console.warn('Fast2SMS dispatch warning:', smsErr.message);
      }
    }

    console.log(`[SMS OTP AUTH] Mobile: ${cleanPhone} | Generated OTP: ${otp} | LiveSent: ${liveSent}`);
    res.json({
      success: true,
      message: `6-Digit OTP sent successfully to +91 ${cleanPhone}`,
      simulated_otp: otp,
      live_sent: liveSent
    });
  } catch (err) {
    console.error('Send phone OTP error:', err.message);
    res.status(500).json({ error: 'Failed to generate phone OTP', details: err.message });
  }
});

app.post('/api/auth/send-email-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Store in in-memory OTP cache with 10-minute expiry
  inMemoryOtpStore.set(cleanEmail, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

  try {
    await pool.query(
      'INSERT INTO otp_verifications (target, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [cleanEmail, otp, 'email_auth', expiresAt]
    );
  } catch (dbErr) {
    console.warn('[OTP DB INSERT WARNING]', dbErr.message);
  }

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #1A73E8; margin: 0; font-size: 26px; font-weight: 800;">TourEase</h1>
        <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Smart Corridor Travel Platform</p>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; text-align: center;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 12px 0;">Use this single-use verification code to complete your TourEase sign-in:</p>
        <div style="font-size: 32px; font-weight: 800; font-family: monospace; letter-spacing: 6px; color: #1E293B; background: #FFFFFF; border: 2px dashed #CBD5E1; border-radius: 8px; padding: 12px 16px; display: inline-block; margin-bottom: 12px;">${otp}</div>
        <p style="color: #94A3B8; font-size: 12px; margin: 0;">Code expires in 10 minutes. Never share this code with anyone.</p>
      </div>
      <p style="color: #94A3B8; font-size: 11.5px; text-align: center; margin-top: 20px;">If you didn't request this code, you can safely ignore this email.</p>
    </div>
  `;

  let liveSent = false;
  let sendError = null;
  try {
    liveSent = await sendNotificationEmail(cleanEmail, `TourEase Verification Code: ${otp}`, emailHtml);
  } catch (mailErr) {
    sendError = mailErr.message;
    console.warn('[EMAIL DISPATCH WARNING]', mailErr.message);
  }

  console.log(`[EMAIL OTP AUTH] Target: ${cleanEmail} | Generated OTP: ${otp} | LiveSent: ${liveSent}`);

  if (liveSent) {
    res.json({
      success: true,
      message: `6-Digit verification code sent to ${cleanEmail}`,
      live_sent: true
    });
  } else {
    // If Render free-tier firewall blocks outbound SMTP ports (465/587)
    res.status(503).json({
      success: false,
      error: 'Render free-tier firewall blocks outbound SMTP ports (465/587). Please use "Continue with Google" for instant one-click sign-in or check server logs.',
      smtp_blocked: true,
      live_sent: false
    });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { target, otp_code, role, full_name } = req.body;
  if (!target || !otp_code) {
    return res.status(400).json({ error: 'Target identifier and OTP code are required' });
  }
  const cleanTarget = target.toString().trim();
  const cleanCode = otp_code.toString().trim();

  try {
    let isValidOtp = false;
    let otpRowId = null;

    // 1. Check in-memory store
    const memOtp = inMemoryOtpStore.get(cleanTarget.toLowerCase()) || inMemoryOtpStore.get(cleanTarget);
    if (memOtp && memOtp.otp === cleanCode && memOtp.expiresAt > Date.now()) {
      isValidOtp = true;
      inMemoryOtpStore.delete(cleanTarget.toLowerCase());
    }

    // 2. Check database
    try {
      const otpRes = await pool.query(
        `SELECT * FROM otp_verifications 
         WHERE target = $1 AND otp_code = $2 AND expires_at > NOW() AND verified = FALSE 
         ORDER BY created_at DESC LIMIT 1`,
        [cleanTarget, cleanCode]
      );
      if (otpRes.rows.length > 0) {
        isValidOtp = true;
        otpRowId = otpRes.rows[0].id;
      }
    } catch (dbQueryErr) {
      console.warn('[OTP DB QUERY NOTICE]', dbQueryErr.message);
    }

    if (!isValidOtp) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    if (otpRowId) {
      await pool.query('UPDATE otp_verifications SET verified = TRUE WHERE id = $1', [otpRowId]).catch(() => { });
    }

    const isEmail = cleanTarget.includes('@');
    let userRes;
    const assignedRole = role || 'traveler';
    const userName = full_name || (isEmail ? cleanTarget.split('@')[0] : `Traveler ${cleanTarget.slice(-4)}`);

    if (isEmail) {
      userRes = await pool.query('SELECT * FROM users WHERE email = $1', [cleanTarget.toLowerCase()]);
      if (userRes.rows.length === 0) {
        userRes = await pool.query(
          'INSERT INTO users (name, email, role, auth_provider) VALUES ($1, $2, $3, $4) RETURNING *',
          [userName, cleanTarget.toLowerCase(), assignedRole, 'email_otp']
        );
      }
    } else {
      userRes = await pool.query('SELECT * FROM users WHERE phone = $1', [cleanTarget]);
      if (userRes.rows.length === 0) {
        userRes = await pool.query(
          'INSERT INTO users (name, phone, role, auth_provider) VALUES ($1, $2, $3, $4) RETURNING *',
          [userName, cleanTarget, assignedRole, 'phone_otp']
        );
      }
    }

    const user = userRes.rows[0];
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been suspended by administration. Please contact support@tourease.in.' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    // Record login in audit logs
    await recordAuditLog(user.email || cleanTarget, user.role || assignedRole, isEmail ? 'email_otp' : 'phone_otp', 'LOGIN', req);

    res.json({
      success: true,
      message: 'Authentication successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || assignedRole,
        auth_provider: user.auth_provider
      }
    });
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    res.status(500).json({ error: 'Failed to verify OTP', details: err.message });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const { credential, email, name, sub, role } = req.body;
  let googleEmail = email;
  let googleName = name;
  let googleSub = sub;

  if (credential) {
    try {
      // Step 1: Verify token with Google Identity Services public endpoint
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (verifyRes.ok) {
        const tokenInfo = await verifyRes.json();
        googleEmail = tokenInfo.email || googleEmail;
        googleName = tokenInfo.name || googleName;
        googleSub = tokenInfo.sub || googleSub;
      } else {
        // Fallback: decode JWT payload
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          googleEmail = payload.email || googleEmail;
          googleName = payload.name || googleName;
          googleSub = payload.sub || googleSub;
        }
      }
    } catch (e) {
      console.warn('Google credential verification note:', e.message);
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          googleEmail = payload.email || googleEmail;
          googleName = payload.name || googleName;
          googleSub = payload.sub || googleSub;
        }
      } catch (decodeErr) {
        console.warn('Google decode fallback warning:', decodeErr.message);
      }
    }
  }

  if (!googleEmail) {
    return res.status(400).json({ error: 'Google account email is required' });
  }

  const cleanEmail = googleEmail.toLowerCase();
  const assignedRole = role || 'traveler';
  const finalName = googleName || cleanEmail.split('@')[0];

  try {
    let userRes = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (userRes.rows.length === 0) {
      userRes = await pool.query(
        'INSERT INTO users (name, email, google_sub, role, auth_provider) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [finalName, cleanEmail, googleSub || '', assignedRole, 'google']
      );
    } else {
      userRes = await pool.query(
        'UPDATE users SET google_sub = COALESCE($1, google_sub), role = COALESCE($2, role) WHERE id = $3 RETURNING *',
        [googleSub, assignedRole, userRes.rows[0].id]
      );
    }

    const user = userRes.rows[0];
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been suspended by administration. Please contact support@tourease.in.' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    // Send real sign-in notification email to the user's Gmail address
    const notifyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #1A73E8; margin: 0; font-size: 26px; font-weight: 800;">TourEase</h1>
          <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Security Alert: Account Activity</p>
        </div>
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 18px; margin-bottom: 16px;">
          <strong style="color: #166534; font-size: 15px; display: block; margin-bottom: 6px;">New Sign-In to TourEase on Android/Web</strong>
          <p style="color: #14532D; font-size: 13px; margin: 0;">We noticed a successful sign-in with your Google Account (${cleanEmail}).</p>
        </div>
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px; font-size: 13px; color: #334155; line-height: 1.6;">
          <div>👤 <strong>Name:</strong> ${user.name}</div>
          <div>🧭 <strong>Role:</strong> ${(user.role || assignedRole).toUpperCase()}</div>
          <div>🕒 <strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
          <div>🌐 <strong>Method:</strong> Google Identity OAuth 2.0</div>
        </div>
        <p style="color: #94A3B8; font-size: 12px; margin-top: 16px; text-align: center;">If this was you, no further action is needed.</p>
      </div>
    `;
    sendNotificationEmail(cleanEmail, 'New Sign-In to TourEase on Android/Web', notifyHtml).catch(e => console.warn('Email notify error:', e));

    // Record login in audit logs
    await recordAuditLog(cleanEmail, user.role || assignedRole, 'google', 'LOGIN', req);

    res.json({
      success: true,
      message: 'Google authentication successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        auth_provider: 'google'
      }
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ error: 'Failed to authenticate with Google', details: err.message });
  }
});

// Logout API & Audit Logger
app.post('/api/auth/logout', async (req, res) => {
  const { email, role, auth_method } = req.body || {};
  await recordAuditLog(email, role, auth_method || 'session', 'LOGOUT', req);
  res.json({ success: true, message: 'Logged out successfully' });
});

// --- Dynamic Ride Payment QR Code & Settle Endpoints ---
app.get('/api/rides/cab/:trackingCode/qr', async (req, res) => {
  const { trackingCode } = req.params;
  try {
    const result = await pool.query('SELECT * FROM cab_rides WHERE tracking_code = $1', [trackingCode]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cab ride not found' });
    }
    const ride = result.rows[0];
    const fare = parseFloat(ride.fare);
    const qrData = JSON.stringify({
      protocol: 'tourease_qr_pay_v1',
      tracking_code: ride.tracking_code,
      fare: fare,
      driver_name: ride.driver_name,
      car_model: ride.car_model,
      token: `PAYTOKEN-${ride.tracking_code}-${Date.now()}`
    });

    const qrImage = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 260,
      color: {
        dark: '#1E293B',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      tracking_code: ride.tracking_code,
      fare: fare,
      driver_name: ride.driver_name,
      car_model: ride.car_model,
      qr_image: qrImage,
      qr_payload: qrData
    });
  } catch (err) {
    console.error('Generate ride QR error:', err.message);
    res.status(500).json({ error: 'Failed to generate payment QR', details: err.message });
  }
});

app.post('/api/payments/cab/qr-settle', async (req, res) => {
  const { tracking_code, amount, scan_token } = req.body;
  if (!tracking_code) {
    return res.status(400).json({ error: 'Tracking code is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rideRes = await client.query('SELECT * FROM cab_rides WHERE tracking_code = $1 FOR UPDATE', [tracking_code]);
    if (rideRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cab ride not found' });
    }

    const ride = rideRes.rows[0];
    const grossFare = parseFloat(amount || ride.fare);
    const commission8 = Math.round(grossFare * 0.08 * 100) / 100;
    const netDriver92 = Math.round((grossFare - commission8) * 100) / 100;

    await client.query(`
      UPDATE cab_rides SET
        status = 'completed',
        payment_method = 'online_qr'
      WHERE tracking_code = $1
    `, [tracking_code]);

    // Lock and credit driver wallet
    const walletRes = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', ['cab_owner']);
    let currentBal = walletRes.rows.length > 0 ? parseFloat(walletRes.rows[0].total_balance) : 1500.00;
    const newBalance = Math.round((currentBal + netDriver92) * 100) / 100;
    const newWithdrawable = Math.max(0, Math.round((newBalance - 500) * 100) / 100);

    await client.query(`
      INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance, updated_at)
      VALUES ('cab_owner', $1, $2, NOW())
      ON CONFLICT (role) DO UPDATE SET
        total_balance = EXCLUDED.total_balance,
        withdrawable_balance = EXCLUDED.withdrawable_balance,
        updated_at = NOW()
    `, [newBalance, newWithdrawable]);

    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
      VALUES ('cab_owner', 'ONLINE_QR_ESCROW_CREDIT', $1, $2, $3, $4, $5)
    `, [
      `Scan-to-Pay QR Ride Payout (92%) - #${tracking_code}`,
      grossFare,
      commission8,
      netDriver92,
      newBalance
    ]);

    await client.query('COMMIT');
    res.json({
      success: true,
      tracking_code,
      fare: grossFare,
      net_credited: netDriver92,
      message: 'Payment settled successfully via Driver QR'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cab QR settle error:', err.message);
    res.status(500).json({ error: 'Failed to settle cab payment', details: err.message });
  } finally {
    client.release();
  }
});

// --- Flow B: Direct In-App Checkout API (Rentals & Tours — No QR Scan) ---
app.post('/api/payments/direct-checkout', async (req, res) => {
  const {
    payment_type, // 'rental' or 'tour'
    tracking_code,
    amount,
    method, // 'UPI' or 'CARD'
    upi_id,
    card_last4,
    // Tour details
    package_title,
    travel_date,
    travelers_count,
    // Rental details
    customer_name,
    car_model,
    plate_number,
    pickup_location,
    drop_location,
    pickup_date,
    return_date,
    total_days
  } = req.body;

  const grossFare = parseFloat(amount) || 0;
  if (!payment_type || grossFare <= 0) {
    return res.status(400).json({ error: 'Valid payment_type and amount are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (payment_type === 'rental') {
      const tracking = tracking_code || `RNT-${Math.floor(1000 + Math.random() * 9000)}`;
      const days = parseInt(total_days) || 1;

      const result = await client.query(`
        INSERT INTO rental_bookings (
          tracking_code, customer_name, car_model, plate_number,
          pickup_location, drop_location, pickup_date, return_date,
          total_days, total_amount, handover_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'awaiting_handover')
        ON CONFLICT (tracking_code) DO UPDATE SET
          total_amount = EXCLUDED.total_amount
        RETURNING *
      `, [
        tracking,
        customer_name || 'Traveler',
        car_model || 'Self-Drive Vehicle',
        plate_number || 'MP-09-TH-2024',
        pickup_location || 'Ujjain Hub',
        drop_location || 'Indore Hub',
        pickup_date || new Date().toISOString().split('T')[0],
        return_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
        days,
        grossFare
      ]);

      // 70% Vendor Payout in Escrow (silent commission deduction)
      const vendorCredit70 = Math.round(grossFare * 0.70 * 100) / 100;
      const commission30 = Math.round(grossFare * 0.30 * 100) / 100;

      const vWallet = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', ['rental_vendor']);
      const curBal = vWallet.rows.length > 0 ? parseFloat(vWallet.rows[0].total_balance) : 0;
      const newBal = Math.round((curBal + vendorCredit70) * 100) / 100;

      await client.query(`
        INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance, updated_at)
        VALUES ('rental_vendor', $1, $1, NOW())
        ON CONFLICT (role) DO UPDATE SET
          total_balance = EXCLUDED.total_balance,
          withdrawable_balance = EXCLUDED.total_balance,
          updated_at = NOW()
      `, [newBal]);

      await client.query(`
        INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
        VALUES ('rental_vendor', 'RENTAL_PAYOUT', $1, $2, $3, $4, $5)
      `, [
        `Self-Drive In-App Checkout (70%) - Booking #${tracking}`,
        grossFare,
        commission30,
        vendorCredit70,
        newBal
      ]);

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        payment_type: 'rental',
        tracking_code: tracking,
        total_fare: grossFare,
        booking: result.rows[0],
        message: 'Rental booked and paid securely via In-App Gateway'
      });
    } else if (payment_type === 'tour') {
      const tracking = tracking_code || `TE-${Math.floor(1000 + Math.random() * 9000)}`;
      const commissionAmt = Math.round(grossFare * 0.12 * 100) / 100;
      const netDriverPool = Math.round((grossFare - commissionAmt) * 100) / 100;

      const result = await client.query(`
        INSERT INTO tour_bookings (
          tracking_code, package_title, travel_date, travelers_count, total_amount, payment_method, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED')
        ON CONFLICT (tracking_code) DO UPDATE SET
          total_amount = EXCLUDED.total_amount
        RETURNING *
      `, [
        tracking,
        package_title || 'Pilgrimage Heritage Tour',
        travel_date || new Date().toISOString().split('T')[0],
        parseInt(travelers_count) || 2,
        grossFare,
        method === 'CARD' ? 'Credit / Debit Card' : 'In-App UPI Gateway'
      ]);

      await client.query(`
        INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
        VALUES 
          ('platform_revenue', 'TOUR_COMMISSION', $1, $2, $3, $3, 0),
          ('driver_escrow', 'TOUR_PAYOUT_POOL', $4, $2, 0, $5, 0)
      `, [
        `Platform Commission (12%) - ${tracking}`,
        grossFare,
        commissionAmt,
        `Driver & Vehicle Payout Pool (88%) - ${tracking}`,
        netDriverPool
      ]);

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        payment_type: 'tour',
        tracking_code: tracking,
        total_fare: grossFare,
        booking: result.rows[0],
        message: 'Tour package booked and paid securely via In-App Gateway'
      });
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Unknown payment_type: ' + payment_type });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Direct checkout error:', err.message);
    res.status(500).json({ error: 'Failed to process direct payment', details: err.message });
  } finally {
    client.release();
  }
});

// --- State Sync Poll Route (GET /api/state) ---
app.get('/api/state', async (req, res) => {
  try {
    const [tours, cabs, rentals, fleet, wallets, txns, kyc, tourPkgs, customAiPkgs, bills] = await Promise.all([
      pool.query('SELECT * FROM tour_bookings ORDER BY created_at DESC LIMIT 50'),
      pool.query('SELECT * FROM cab_rides ORDER BY created_at DESC LIMIT 50'),
      pool.query('SELECT * FROM rental_bookings ORDER BY created_at DESC LIMIT 50'),
      pool.query('SELECT * FROM rental_fleet ORDER BY id ASC'),
      pool.query('SELECT * FROM wallet_accounts'),
      pool.query('SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 50'),
      pool.query('SELECT * FROM kyc_profiles'),
      pool.query('SELECT * FROM tour_packages WHERE is_approved = TRUE ORDER BY id ASC'),
      pool.query('SELECT * FROM custom_ai_packages ORDER BY created_at DESC LIMIT 50'),
      pool.query('SELECT * FROM bill_dispatches ORDER BY dispatched_at DESC LIMIT 50')
    ]);

    res.json({
      success: true,
      timestamp: Date.now(),
      tour_bookings: tours.rows,
      cab_rides: cabs.rows,
      rental_bookings: rentals.rows,
      rental_fleet: fleet.rows,
      wallet_accounts: wallets.rows,
      wallet_transactions: txns.rows,
      kyc_profiles: kyc.rows,
      tour_packages: tourPkgs.rows,
      custom_ai_packages: customAiPkgs.rows,
      bill_dispatches: bills.rows
    });
  } catch (err) {
    console.error('State sync error:', err.message);
    res.status(500).json({ error: 'Failed to fetch global state', details: err.message });
  }
});

// --- User Registration & Login ---
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, passwordHash]
    );

    res.status(201).json({ message: 'User registered successfully', user: newUser.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error during registration (Email might already exist)' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.rows[0].id, email: user.rows[0].email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, name: user.rows[0].name });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- Cab Rides API ---
app.post('/api/rides/cab', async (req, res) => {
  const {
    customer_name,
    pickup_location,
    drop_location,
    pickup_lat,
    pickup_lng,
    car_model,
    driver_name,
    plate_number,
    fare,
    payment_method,
    tracking_code
  } = req.body;

  const tracking = tracking_code || `CAB-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    const result = await pool.query(`
      INSERT INTO cab_rides (
        tracking_code, customer_name, pickup_location, drop_location,
        pickup_lat, pickup_lng, car_model, driver_name, plate_number,
        fare, payment_method, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'requested')
      ON CONFLICT (tracking_code) DO UPDATE SET
        status = 'requested',
        fare = EXCLUDED.fare,
        payment_method = EXCLUDED.payment_method
      RETURNING *
    `, [
      tracking,
      customer_name || 'Traveler',
      pickup_location || 'Mahakaleshwar Temple, Ujjain',
      drop_location || 'Freeganj Market, Ujjain',
      pickup_lat || 23.1824,
      pickup_lng || 75.7682,
      car_model || 'Prime Sedan',
      driver_name || 'Ramesh Verma',
      plate_number || 'MP-09-CB-4491',
      fare || 149.00,
      payment_method || 'cash'
    ]);

    res.status(201).json({ success: true, ride: result.rows[0] });
  } catch (err) {
    console.error('Cab booking error:', err.message);
    res.status(500).json({ error: 'Failed to create cab ride', details: err.message });
  }
});

app.patch('/api/rides/cab/:trackingCode/status', async (req, res) => {
  const { trackingCode } = req.params;
  const { status, payment_mode } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const rideRes = await client.query('SELECT * FROM cab_rides WHERE tracking_code = $1 FOR UPDATE', [trackingCode]);
    if (rideRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cab ride not found' });
    }

    const ride = rideRes.rows[0];
    const prevStatus = ride.status;

    const updatedRide = await client.query(`
      UPDATE cab_rides SET
        status = $1,
        payment_method = COALESCE($2, payment_method)
      WHERE tracking_code = $3
      RETURNING *
    `, [status, payment_mode, trackingCode]);

    // Financial settlement if transitioning to completed
    if (status === 'completed' && prevStatus !== 'completed') {
      const grossFare = parseFloat(ride.fare);
      const commission8 = Math.round(grossFare * 0.08 * 100) / 100;
      const netDriver92 = Math.round((grossFare - commission8) * 100) / 100;

      // Lock and update wallet
      const walletRes = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', ['cab_owner']);
      let currentBal = walletRes.rows.length > 0 ? parseFloat(walletRes.rows[0].total_balance) : 1500.00;

      const isCash = (payment_mode || ride.payment_method) === 'cash';
      let newBalance = currentBal;

      if (isCash) {
        // Driver collected 100% in cash; platform deducts 8% commission from driver's wallet
        newBalance = Math.round((currentBal - commission8) * 100) / 100;
        const newWithdrawable = Math.max(0, Math.round((newBalance - 500) * 100) / 100);

        await client.query(`
          INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance, updated_at)
          VALUES ('cab_owner', $1, $2, NOW())
          ON CONFLICT (role) DO UPDATE SET
            total_balance = EXCLUDED.total_balance,
            withdrawable_balance = EXCLUDED.withdrawable_balance,
            updated_at = NOW()
        `, [newBalance, newWithdrawable]);

        await client.query(`
          INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
          VALUES ('cab_owner', 'COMMISSION_DEDUCTION', $1, $2, $3, $4, $5)
        `, [
          `Platform Fee (8%) - Cash Trip #${trackingCode}`,
          grossFare,
          commission8,
          -commission8,
          newBalance
        ]);
      } else {
        // Direct In-App Online payment; platform credits 92% to driver's wallet
        newBalance = Math.round((currentBal + netDriver92) * 100) / 100;
        const newWithdrawable = Math.max(0, Math.round((newBalance - 500) * 100) / 100);

        await client.query(`
          INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance, updated_at)
          VALUES ('cab_owner', $1, $2, NOW())
          ON CONFLICT (role) DO UPDATE SET
            total_balance = EXCLUDED.total_balance,
            withdrawable_balance = EXCLUDED.withdrawable_balance,
            updated_at = NOW()
        `, [newBalance, newWithdrawable]);

        await client.query(`
          INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
          VALUES ('cab_owner', 'ONLINE_ESCROW_CREDIT', $1, $2, $3, $4, $5)
        `, [
          `Online Ride Payout (92%) - #${trackingCode}`,
          grossFare,
          commission8,
          netDriver92,
          newBalance
        ]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, ride: updatedRide.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update ride status error:', err.message);
    res.status(500).json({ error: 'Failed to update ride status', details: err.message });
  } finally {
    client.release();
  }
});

// --- Self-Drive Rentals API ---
app.post('/api/rentals/book', async (req, res) => {
  const {
    tracking_code,
    customer_name,
    car_model,
    plate_number,
    pickup_location,
    drop_location,
    pickup_date,
    return_date,
    total_days,
    total_amount
  } = req.body;

  const tracking = tracking_code || `RNT-${Math.floor(1000 + Math.random() * 9000)}`;
  const days = parseInt(total_days) || 1;
  const fare = parseFloat(total_amount) || 2800.00;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO rental_bookings (
        tracking_code, customer_name, car_model, plate_number,
        pickup_location, drop_location, pickup_date, return_date,
        total_days, total_amount, handover_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'awaiting_handover')
      ON CONFLICT (tracking_code) DO UPDATE SET
        pickup_date = EXCLUDED.pickup_date,
        return_date = EXCLUDED.return_date,
        total_amount = EXCLUDED.total_amount
      RETURNING *
    `, [
      tracking,
      customer_name || 'Traveler',
      car_model || 'Mahindra Thar 4x4',
      plate_number || 'MP-09-TH-2024',
      pickup_location || 'Ujjain Hub',
      drop_location || 'Indore Hub',
      pickup_date || new Date().toISOString().split('T')[0],
      return_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
      days,
      fare
    ]);

    // 70% Vendor Payout in Escrow
    const vendorCredit70 = Math.round(fare * 0.70 * 100) / 100;
    const commission30 = Math.round(fare * 0.30 * 100) / 100;

    const vWallet = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', ['rental_vendor']);
    const curBal = vWallet.rows.length > 0 ? parseFloat(vWallet.rows[0].total_balance) : 0;
    const newBal = Math.round((curBal + vendorCredit70) * 100) / 100;

    await client.query(`
      INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance, updated_at)
      VALUES ('rental_vendor', $1, $1, NOW())
      ON CONFLICT (role) DO UPDATE SET
        total_balance = EXCLUDED.total_balance,
        withdrawable_balance = EXCLUDED.total_balance,
        updated_at = NOW()
    `, [newBal]);

    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
      VALUES ('rental_vendor', 'RENTAL_PAYOUT', $1, $2, $3, $4, $5)
    `, [
      `Self-Drive Payout (70%) - Booking #${tracking}`,
      fare,
      commission30,
      vendorCredit70,
      newBal
    ]);

    await client.query('COMMIT');
    res.status(201).json({ success: true, booking: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rental booking error:', err.message);
    res.status(500).json({ error: 'Failed to create rental reservation', details: err.message });
  } finally {
    client.release();
  }
});

app.patch('/api/rentals/book/:trackingCode/handover', async (req, res) => {
  const { trackingCode } = req.params;
  const { handover_status } = req.body;

  try {
    const status = handover_status || 'handed_over';
    const result = await pool.query(`
      UPDATE rental_bookings SET
        handover_status = $1
      WHERE tracking_code = $2
      RETURNING *
    `, [status, trackingCode]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental reservation not found' });
    }

    res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    console.error('Handover update error:', err.message);
    res.status(500).json({ error: 'Failed to update vehicle handover status', details: err.message });
  }
});

// --- Rental Fleet Management ---
app.post('/api/rentals/fleet', async (req, res) => {
  const { car_model, plate_number, model_year, daily_rate, seats, transmission, image_url, image_data } = req.body;
  const currentYear = new Date().getFullYear();
  const year = parseInt(model_year) || currentYear;
  const isCompliant = (currentYear - year) < 5;
  const vImg = image_data || image_url || SUV_CRETA_SVG;

  try {
    const result = await pool.query(`
      INSERT INTO rental_fleet (car_model, plate_number, model_year, daily_rate, seats, transmission, image_url, image_data, is_compliant)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
      ON CONFLICT (plate_number) DO UPDATE SET
        car_model = EXCLUDED.car_model,
        daily_rate = EXCLUDED.daily_rate,
        seats = EXCLUDED.seats,
        image_url = EXCLUDED.image_url,
        image_data = EXCLUDED.image_data,
        is_compliant = EXCLUDED.is_compliant
      RETURNING *
    `, [
      car_model,
      plate_number,
      year,
      parseFloat(daily_rate) || 2500.00,
      parseInt(seats) || 5,
      transmission || 'Automatic',
      vImg,
      isCompliant
    ]);

    res.status(201).json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    console.error('Add rental fleet error:', err.message);
    res.status(500).json({ error: 'Failed to add vehicle to rental fleet', details: err.message });
  }
});

app.delete('/api/rentals/fleet/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const carRes = await pool.query('SELECT * FROM rental_fleet WHERE id = $1', [id]);
    if (carRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    const car = carRes.rows[0];

    // Check if active or awaiting reservation exists in rental_bookings
    const activeRes = await pool.query(`
      SELECT * FROM rental_bookings 
      WHERE (plate_number = $1 OR car_model ILIKE $2)
        AND handover_status IN ('awaiting_handover', 'handed_over')
      LIMIT 1
    `, [car.plate_number, `%${car.car_model}%`]);

    if (activeRes.rows.length > 0) {
      return res.status(400).json({
        error: `Cannot remove vehicle ${car.car_model} (${car.plate_number}): active reservation (${activeRes.rows[0].tracking_code}) is in progress.`
      });
    }

    await pool.query('DELETE FROM rental_fleet WHERE id = $1', [id]);
    res.json({ success: true, message: 'Vehicle deleted from fleet' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete vehicle', details: err.message });
  }
});

// --- Customer Cancellations & Refund APIs ---
app.post('/api/bookings/tour/:trackingCode/cancel', async (req, res) => {
  const { trackingCode } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query('SELECT * FROM tour_bookings WHERE tracking_code = $1 FOR UPDATE', [trackingCode]);
    if (bRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tour booking not found' });
    }
    const booking = bRes.rows[0];
    if (booking.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }
    await client.query(`UPDATE tour_bookings SET status = 'CANCELLED' WHERE tracking_code = $1`, [trackingCode]);

    const refundAmt = parseFloat(booking.total_amount);
    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
      VALUES ('platform_revenue', 'refund', $1, $2, 0, $3, 0)
    `, [`Customer Refund - Tour Booking #${trackingCode}`, -refundAmt, -refundAmt]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Tour booking cancelled and instant refund processed', refund_amount: refundAmt });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to cancel tour booking', details: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/rentals/book/:trackingCode/cancel', async (req, res) => {
  const { trackingCode } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rRes = await client.query('SELECT * FROM rental_bookings WHERE tracking_code = $1 FOR UPDATE', [trackingCode]);
    if (rRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental reservation not found' });
    }
    const rental = rRes.rows[0];
    if (rental.handover_status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reservation is already cancelled' });
    }
    await client.query(`UPDATE rental_bookings SET handover_status = 'CANCELLED' WHERE tracking_code = $1`, [trackingCode]);

    const totalAmt = parseFloat(rental.total_amount);
    const vendorCredit70 = Math.round(totalAmt * 0.70 * 100) / 100;

    // Reverse vendor wallet escrow
    const vWallet = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', ['rental_vendor']);
    const curBal = vWallet.rows.length > 0 ? parseFloat(vWallet.rows[0].total_balance) : 0;
    const newBal = Math.max(0, Math.round((curBal - vendorCredit70) * 100) / 100);

    await client.query(`
      UPDATE wallet_accounts SET total_balance = $1, withdrawable_balance = $1, updated_at = NOW() WHERE role = 'rental_vendor'
    `, [newBal]);

    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
      VALUES 
        ('rental_vendor', 'refund', $1, $2, 0, $3, $4),
        ('platform_revenue', 'refund', $5, $6, 0, $6, 0)
    `, [
      `Self-Drive Booking Cancelled - Escrow Reversal #${trackingCode}`,
      -totalAmt,
      -vendorCredit70,
      newBal,
      `Customer Refund - Self-Drive #${trackingCode}`,
      -totalAmt
    ]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Rental reservation cancelled and refund processed', refund_amount: totalAmt });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to cancel rental reservation', details: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/rides/cab/:trackingCode/cancel', async (req, res) => {
  const { trackingCode } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cRes = await client.query('SELECT * FROM cab_rides WHERE tracking_code = $1 FOR UPDATE', [trackingCode]);
    if (cRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cab ride not found' });
    }
    const ride = cRes.rows[0];
    if (ride.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ride is already cancelled' });
    }
    await client.query(`UPDATE cab_rides SET status = 'cancelled' WHERE tracking_code = $1`, [trackingCode]);

    const fare = parseFloat(ride.fare);
    if (ride.payment_method === 'online') {
      await client.query(`
        INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
        VALUES ('platform_revenue', 'refund', $1, $2, 0, $2, 0)
      `, [`Customer Refund - Online Cab Ride #${trackingCode}`, -fare]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Cab ride cancelled successfully', refund_amount: ride.payment_method === 'online' ? fare : 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to cancel cab ride', details: err.message });
  } finally {
    client.release();
  }
});

// --- Digital Bill Dispatch API ---
app.post('/api/bills/send', async (req, res) => {
  const { tracking_code, channel, recipient, fare_breakdown } = req.body;
  if (!tracking_code || !channel || !recipient) {
    return res.status(400).json({ error: 'tracking_code, channel, and recipient are required' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO bill_dispatches (tracking_code, channel, recipient, fare_breakdown)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      tracking_code,
      channel,
      recipient,
      JSON.stringify(fare_breakdown || {})
    ]);
    res.json({
      success: true,
      message: `Digital bill dispatched successfully via ${channel.toUpperCase()} to ${recipient}`,
      dispatch: result.rows[0]
    });
  } catch (err) {
    console.error('Bill dispatch error:', err.message);
    res.status(500).json({ error: 'Failed to record bill dispatch', details: err.message });
  }
});

app.get('/api/rentals/fleet', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rental_fleet ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rental fleet', details: err.message });
  }
});

// --- Tour Bookings API ---
app.post('/api/bookings/tour', async (req, res) => {
  const { package_title, travel_date, travelers_count, total_amount, payment_method, tracking_code } = req.body;
  const tracking = tracking_code || `TE-${Math.floor(1000 + Math.random() * 9000)}`;
  const grossAmt = parseFloat(total_amount) || 4999.00;
  const commissionAmt = Math.round(grossAmt * 0.12 * 100) / 100;
  const netDriverPool = Math.round((grossAmt - commissionAmt) * 100) / 100;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO tour_bookings (
        tracking_code, package_title, travel_date, travelers_count, total_amount, payment_method, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED')
      RETURNING *
    `, [
      tracking,
      package_title || 'Pilgrimage Heritage Tour',
      travel_date || new Date().toISOString().split('T')[0],
      parseInt(travelers_count) || 2,
      grossAmt,
      payment_method || 'UPI / Card Online'
    ]);

    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
      VALUES 
        ('platform_revenue', 'TOUR_COMMISSION', $1, $2, $3, $3, 0),
        ('driver_escrow', 'TOUR_PAYOUT_POOL', $4, $2, 0, $5, 0)
    `, [
      `Platform Commission (12%) - ${tracking}`,
      grossAmt,
      commissionAmt,
      `Driver & Vehicle Payout Pool (88%) - ${tracking}`,
      netDriverPool
    ]);

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      booking: result.rows[0],
      gross_amount: grossAmt,
      commission_amount: commissionAmt,
      net_tour_budget: netDriverPool
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Tour booking error:', err.message);
    res.status(500).json({ error: 'Failed to record tour package booking', details: err.message });
  } finally {
    client.release();
  }
});

// --- Wallet & KYC APIs ---
app.post('/api/wallet/recharge', async (req, res) => {
  const { role, amount } = req.body;
  const targetRole = role || 'cab_owner';
  const rechargeAmt = parseFloat(amount) || 500.00;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const wRes = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', [targetRole]);
    const curBal = wRes.rows.length > 0 ? parseFloat(wRes.rows[0].total_balance) : 0;
    const newBal = Math.round((curBal + rechargeAmt) * 100) / 100;
    const newWithdrawable = Math.max(0, Math.round((newBal - 500) * 100) / 100);

    await client.query(`
      INSERT INTO wallet_accounts (role, total_balance, withdrawable_balance, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (role) DO UPDATE SET
        total_balance = EXCLUDED.total_balance,
        withdrawable_balance = EXCLUDED.withdrawable_balance,
        updated_at = NOW()
    `, [targetRole, newBal, newWithdrawable]);

    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, net_amount, balance_after)
      VALUES ($1, 'RECHARGE', $2, $3, $3, $4)
    `, [targetRole, `Wallet Recharge (+₹${rechargeAmt})`, rechargeAmt, newBal]);

    await client.query('COMMIT');
    res.json({ success: true, balance: newBal, withdrawable: newWithdrawable });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to recharge wallet', details: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/wallet/withdraw', async (req, res) => {
  const { role, amount } = req.body;
  const targetRole = role || 'cab_owner';
  const withdrawAmt = parseFloat(amount);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const wRes = await client.query('SELECT * FROM wallet_accounts WHERE role = $1 FOR UPDATE', [targetRole]);
    if (wRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Wallet account not found' });
    }

    const curBal = parseFloat(wRes.rows[0].total_balance);
    const minReserve = targetRole === 'cab_owner' ? 500.00 : 0.00;
    const maxAllowed = Math.max(0, curBal - minReserve);

    if (isNaN(withdrawAmt) || withdrawAmt <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (withdrawAmt > maxAllowed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient withdrawable funds. Max withdrawable: ₹${maxAllowed.toFixed(2)} (Minimum reserve: ₹${minReserve.toFixed(2)})`
      });
    }

    const newBal = Math.round((curBal - withdrawAmt) * 100) / 100;
    const newWithdrawable = Math.max(0, Math.round((newBal - minReserve) * 100) / 100);

    await client.query(`
      UPDATE wallet_accounts SET
        total_balance = $1,
        withdrawable_balance = $2,
        updated_at = NOW()
      WHERE role = $3
    `, [newBal, newWithdrawable, targetRole]);

    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, net_amount, balance_after)
      VALUES ($1, 'WITHDRAWAL', $2, $3, $4, $5)
    `, [targetRole, `Bank Withdrawal (-₹${withdrawAmt.toFixed(2)})`, withdrawAmt, -withdrawAmt, newBal]);

    await client.query('COMMIT');
    res.json({ success: true, balance: newBal, withdrawable: newWithdrawable });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to process bank withdrawal', details: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/kyc', async (req, res) => {
  const {
    role, full_name, license_or_gst, vehicle_model, plate_number, model_year,
    photo_data, vehicle_photo_data, doc_pdf_name, doc_pdf_data, verified
  } = req.body;

  const targetRole = role || 'cab_owner';
  const vPhoto = vehicle_photo_data || photo_data || '';
  const mYear = parseInt(model_year, 10) || 2024;
  const isCompliant = (new Date().getFullYear() - mYear) < 5;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO kyc_profiles (
        role, full_name, license_or_gst, vehicle_model, plate_number, model_year,
        photo_data, vehicle_photo_data, doc_pdf_name, doc_pdf_data, verified, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (role) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        license_or_gst = EXCLUDED.license_or_gst,
        vehicle_model = EXCLUDED.vehicle_model,
        plate_number = EXCLUDED.plate_number,
        model_year = EXCLUDED.model_year,
        photo_data = EXCLUDED.photo_data,
        vehicle_photo_data = EXCLUDED.vehicle_photo_data,
        doc_pdf_name = EXCLUDED.doc_pdf_name,
        doc_pdf_data = EXCLUDED.doc_pdf_data,
        verified = EXCLUDED.verified,
        updated_at = NOW()
      RETURNING *
    `, [
      targetRole,
      full_name || 'Partner',
      license_or_gst || '',
      vehicle_model || '',
      plate_number || '',
      mYear,
      vPhoto,
      vPhoto,
      doc_pdf_name || '',
      doc_pdf_data || '',
      verified !== undefined ? verified : true
    ]);

    // If Rental Vendor registers a vehicle, auto-register into rental_fleet so travelers can book it immediately!
    if (targetRole === 'rental_vendor' && vehicle_model && plate_number) {
      await client.query(`
        INSERT INTO rental_fleet (car_model, plate_number, model_year, daily_rate, seats, transmission, image_data, image_url, is_compliant)
        VALUES ($1, $2, $3, 2800.00, 5, 'Automatic', $4, $4, $5)
        ON CONFLICT (plate_number) DO UPDATE SET
          car_model = EXCLUDED.car_model,
          model_year = EXCLUDED.model_year,
          image_data = EXCLUDED.image_data,
          image_url = EXCLUDED.image_url,
          is_compliant = EXCLUDED.is_compliant
      `, [
        vehicle_model,
        plate_number,
        mYear,
        vPhoto || SUV_CRETA_SVG,
        isCompliant
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, profile: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save KYC profile error:', err.message);
    res.status(500).json({ error: 'Failed to save KYC profile', details: err.message });
  } finally {
    client.release();
  }
});

// --- Customer AI Package Staging & Admin Moderation APIs ---
app.post('/api/packages/ai-submit', async (req, res) => {
  const { title, route_summary, duration_days, budget, itinerary_json, user_consented } = req.body;
  try {
    const days = parseInt(duration_days, 10) || 2;
    const priceNum = parseFloat(budget) || 15000;
    const result = await pool.query(`
      INSERT INTO custom_ai_packages (title, route_summary, duration_days, budget, itinerary_json, user_consented, admin_status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING *
    `, [
      title || 'Custom AI Roadtrip',
      route_summary || 'Expressway & Heritage Corridor',
      days,
      priceNum,
      JSON.stringify(itinerary_json || {}),
      user_consented !== undefined ? user_consented : true
    ]);
    res.status(201).json({ success: true, package: result.rows[0] });
  } catch (err) {
    console.error('Submit AI package error:', err.message);
    res.status(500).json({ error: 'Failed to submit package for review', details: err.message });
  }
});

// --- Dedicated Standalone Admin Portal APIs (Protected by ADMIN_SECRET_KEY) ---
const adminAuthMiddleware = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'tourease_admin_2026';
  if (!adminKey || adminKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing Admin Secret Key' });
  }
  next();
};

app.post('/api/admin/verify-key', (req, res) => {
  const { admin_key } = req.body || {};
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'tourease_admin_2026';
  if (admin_key && admin_key === expectedKey) {
    return res.json({ success: true, message: 'Admin authentication verified' });
  }
  return res.status(401).json({ error: 'Invalid Admin Secret Key' });
});

app.get('/api/admin/packages', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM custom_ai_packages WHERE admin_status = 'pending' ORDER BY created_at DESC`
    );
    res.json({ success: true, packages: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending packages', details: err.message });
  }
});

app.post('/api/admin/packages/:id/approve', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updateRes = await client.query(`
      UPDATE custom_ai_packages
      SET admin_status = 'approved'
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (updateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Package not found' });
    }

    const pkg = updateRes.rows[0];
    const perPersonPrice = Math.max(1200, Math.round(parseFloat(pkg.budget || 12000) / 4));

    // Promote into tour_packages
    const insertRes = await client.query(`
      INSERT INTO tour_packages (title, subtitle, duration_days, price, category, image_data, stops_json, is_approved)
      VALUES ($1, $2, $3, $4, 'Community Curated', $5, $6, TRUE)
      RETURNING *
    `, [
      pkg.title,
      pkg.route_summary || `AI curated corridor & stopovers (${pkg.duration_days} Days)`,
      pkg.duration_days,
      perPersonPrice,
      TOUR_HERITAGE_SVG,
      JSON.stringify([
        { time: '08:00 AM', location: 'Origin Corridor', activity: 'Scenic highway departure & breakfast halt', type: 'refreshment' },
        { time: '01:00 PM', location: 'Midpoint Stopover', activity: 'Curated heritage exploration & dining', type: 'heritage' },
        { time: '06:00 PM', location: 'Destination Hub', activity: 'Evening arrival & cultural orientation', type: 'culture' }
      ])
    ]);

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Package approved & published to public Tour Packages catalog',
      promoted: insertRes.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve package error:', err.message);
    res.status(500).json({ error: 'Failed to approve package', details: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/admin/packages/:id/reject', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      UPDATE custom_ai_packages
      SET admin_status = 'rejected'
      WHERE id = $1
      RETURNING *
    `, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json({ success: true, message: 'Package discarded', package: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject package', details: err.message });
  }
});

app.get('/api/admin/compliance', adminAuthMiddleware, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const result = await pool.query(`SELECT * FROM rental_fleet ORDER BY id ASC`);
    const flagged = result.rows.map(car => {
      const year = parseInt(car.year || 2024, 10);
      const age = currentYear - year;
      const isOverAge = age >= 5;
      return {
        ...car,
        age,
        is_compliant: !isOverAge,
        violation_reason: isOverAge ? `Exceeds 5-Year Age Limit (${age} years old)` : null
      };
    });
    res.json({ success: true, fleet: flagged });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fleet compliance', details: err.message });
  }
});

app.post('/api/admin/vehicles/:id/delist', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM rental_fleet WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    res.json({ success: true, message: 'Vehicle de-listed successfully', vehicle: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to de-list vehicle', details: err.message });
  }
});

app.get('/api/admin/financials', adminAuthMiddleware, async (req, res) => {
  try {
    const txRes = await pool.query(
      `SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 50`
    );
    let totalGross = 0;
    let cabCut = 0;
    let rentalCut = 0;
    let tourCut = 0;

    txRes.rows.forEach(tx => {
      const amt = parseFloat(tx.gross_amount || tx.amount || 0);
      const comm = parseFloat(tx.commission_amount || 0);
      totalGross += amt;
      const role = (tx.role || '').toLowerCase();
      if (role === 'cab_owner') cabCut += (comm > 0 ? comm : amt * 0.08);
      else if (role === 'rental_vendor') rentalCut += (comm > 0 ? comm : amt * 0.30);
      else tourCut += (comm > 0 ? comm : amt * 0.12);
    });

    res.json({
      success: true,
      summary: {
        total_gmv: Math.round(totalGross),
        total_platform_revenue: Math.round(cabCut + rentalCut + tourCut),
        breakdown: {
          cab_commission_8pct: Math.round(cabCut),
          rental_commission_30pct: Math.round(rentalCut),
          tour_commission_12pct: Math.round(tourCut)
        }
      },
      transactions: txRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch platform financials', details: err.message });
  }
});

app.get('/api/admin/audit-logs', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM auth_audit_logs ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs', details: err.message });
  }
});

// Partner Onboarding & Document Verification
app.get('/api/admin/partners', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kyc_profiles ORDER BY updated_at DESC');
    res.json({ success: true, partners: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch partner KYC profiles', details: err.message });
  }
});

app.post('/api/admin/partners/:role/approve', adminAuthMiddleware, async (req, res) => {
  const { role } = req.params;
  try {
    const result = await pool.query(
      'UPDATE kyc_profiles SET verified = TRUE, updated_at = NOW() WHERE role = $1 RETURNING *',
      [role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Partner KYC profile not found' });
    res.json({ success: true, message: `Partner onboarding approved for ${role}`, partner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve partner', details: err.message });
  }
});

app.post('/api/admin/partners/:role/reject', adminAuthMiddleware, async (req, res) => {
  const { role } = req.params;
  try {
    const result = await pool.query(
      'UPDATE kyc_profiles SET verified = FALSE, updated_at = NOW() WHERE role = $1 RETURNING *',
      [role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Partner KYC profile not found' });
    res.json({ success: true, message: `Partner onboarding rejected for ${role}`, partner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject partner', details: err.message });
  }
});

// Per-Vehicle Document Verification
app.post('/api/admin/vehicles/:id/verify', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE rental_fleet SET verification_status = 'APPROVED', is_compliant = TRUE WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ success: true, message: 'Vehicle documents verified and approved', vehicle: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify vehicle', details: err.message });
  }
});

app.post('/api/admin/vehicles/:id/reject', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE rental_fleet SET verification_status = 'REJECTED' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ success: true, message: 'Vehicle rejected', vehicle: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject vehicle', details: err.message });
  }
});

// User Governance (List, Ban, Unban, Delete)
app.get('/api/admin/users', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, is_banned, auth_provider, created_at FROM users ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

app.post('/api/admin/users/:id/ban', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE users SET is_banned = TRUE WHERE id = $1 RETURNING id, name, email, is_banned',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: `User ${result.rows[0].email || result.rows[0].name} has been suspended`, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user', details: err.message });
  }
});

app.post('/api/admin/users/:id/unban', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE users SET is_banned = FALSE WHERE id = $1 RETURNING id, name, email, is_banned',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: `User ${result.rows[0].email || result.rows[0].name} has been reinstated`, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban user', details: err.message });
  }
});

app.delete('/api/admin/users/:id', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, name, email',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: `User deleted successfully`, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

// Public "Track a Loved One's Trip" & Live Tracking APIs
const handleTripTrackingLookup = async (req, res) => {
  const code = (req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Tracking code is required' });

  // Check live telemetry cache first
  const liveTelemetry = liveTelemetryStore.get(code.toUpperCase());

  try {
    // 1. Check cab_rides
    const cabRes = await pool.query('SELECT * FROM cab_rides WHERE tracking_code ILIKE $1 LIMIT 1', [code]);
    if (cabRes.rows.length > 0) {
      const r = cabRes.rows[0];
      return res.json({
        success: true,
        trip: {
          code: r.tracking_code,
          service_type: 'City Cab',
          status: r.status,
          customer_name: r.customer_name,
          driver_name: r.driver_name || 'Assigned Chauffeur',
          vehicle: `${r.car_model || 'TourEase Cab'} (${r.plate_number || 'Commercial'})`,
          origin: r.pickup_location,
          destination: r.drop_location,
          pickup_lat: r.pickup_lat || 23.1824,
          pickup_lng: r.pickup_lng || 75.7682,
          current_lat: liveTelemetry?.lat || r.pickup_lat || 23.1824,
          current_lng: liveTelemetry?.lng || r.pickup_lng || 75.7682,
          lat: liveTelemetry?.lat || r.pickup_lat || 23.1824,
          lng: liveTelemetry?.lng || r.pickup_lng || 75.7682,
          fare: r.fare,
          payment_method: r.payment_method,
          updated_at: liveTelemetry?.updatedAt || r.created_at
        }
      });
    }

    // 2. Check tour_bookings
    const tourRes = await pool.query('SELECT * FROM tour_bookings WHERE tracking_code ILIKE $1 LIMIT 1', [code]);
    if (tourRes.rows.length > 0) {
      const t = tourRes.rows[0];
      return res.json({
        success: true,
        trip: {
          code: t.tracking_code,
          service_type: 'Guided Tour',
          status: t.status,
          customer_name: t.customer_name || 'Tour Traveler',
          driver_name: 'TourEase Corridor Chauffeur & Guide',
          vehicle: t.package_title,
          origin: 'Corridor Departure Point',
          destination: t.package_title,
          pickup_lat: 23.1764,
          pickup_lng: 75.7828,
          current_lat: liveTelemetry?.lat || 23.1764,
          current_lng: liveTelemetry?.lng || 75.7828,
          lat: liveTelemetry?.lat || 23.1764,
          lng: liveTelemetry?.lng || 75.7828,
          fare: t.total_amount,
          payment_method: t.payment_method,
          updated_at: liveTelemetry?.updatedAt || t.created_at
        }
      });
    }

    // 3. Check rental_bookings
    const rntRes = await pool.query('SELECT * FROM rental_bookings WHERE tracking_code ILIKE $1 LIMIT 1', [code]);
    if (rntRes.rows.length > 0) {
      const rb = rntRes.rows[0];
      return res.json({
        success: true,
        trip: {
          code: rb.tracking_code,
          service_type: 'Self-Drive Rental',
          status: rb.handover_status,
          customer_name: rb.customer_name,
          driver_name: 'Self-Drive Traveler',
          vehicle: `${rb.car_model} (${rb.plate_number})`,
          origin: rb.pickup_location || 'Authorized Rental Hub',
          destination: rb.drop_location || 'Corridor Highway Route',
          pickup_lat: 23.1824,
          pickup_lng: 75.7682,
          current_lat: liveTelemetry?.lat || 23.1824,
          current_lng: liveTelemetry?.lng || 75.7682,
          lat: liveTelemetry?.lat || 23.1824,
          lng: liveTelemetry?.lng || 75.7682,
          fare: rb.total_price || rb.total_amount,
          payment_method: rb.payment_method,
          updated_at: liveTelemetry?.updatedAt || rb.created_at
        }
      });
    }

    // 4. If present in live telemetry alone
    if (liveTelemetry) {
      return res.json({
        success: true,
        trip: {
          code: code.toUpperCase(),
          service_type: 'Live Vehicle GPS',
          status: 'in_transit',
          customer_name: 'Traveler',
          driver_name: 'TourEase Driver',
          vehicle: 'TourEase Fleet Vehicle',
          origin: 'Pickup Point',
          destination: 'Destination Point',
          pickup_lat: liveTelemetry.lat,
          pickup_lng: liveTelemetry.lng,
          current_lat: liveTelemetry.lat,
          current_lng: liveTelemetry.lng,
          lat: liveTelemetry.lat,
          lng: liveTelemetry.lng,
          fare: 0,
          updated_at: liveTelemetry.updatedAt
        }
      });
    }

    return res.status(404).json({ error: `No active trip found for tracking code "${code}"` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to look up tracking code', details: err.message });
  }
};

app.get('/api/track/:code', handleTripTrackingLookup);
app.get('/api/tracking/:code', handleTripTrackingLookup);

// Cab Owner live GPS location telemetry push
app.patch('/api/tracking/:code', async (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const { lat, lng, speed, heading } = req.body;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  liveTelemetryStore.set(code, {
    lat: parsedLat,
    lng: parsedLng,
    speed: parseFloat(speed) || 0,
    heading: parseFloat(heading) || 0,
    updatedAt: new Date().toISOString()
  });

  try {
    await pool.query(
      'UPDATE cab_rides SET pickup_lat = $1, pickup_lng = $2 WHERE tracking_code ILIKE $3',
      [parsedLat, parsedLng, code]
    );
  } catch (e) {
    // Non-fatal if DB not yet migrated
  }

  res.json({
    success: true,
    tracking_code: code,
    lat: parsedLat,
    lng: parsedLng,
    updated_at: new Date().toISOString()
  });
});

// Self-Drive Rental Cancellation & Refund API
app.patch('/api/bookings/:id/refund', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkRes = await client.query('SELECT * FROM rental_bookings WHERE id::text = $1 OR tracking_code ILIKE $1 LIMIT 1', [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental booking not found' });
    }
    const booking = checkRes.rows[0];
    if (booking.handover_status === 'CANCELLED' || booking.handover_status === 'Cancelled & Refunded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking has already been cancelled and refunded' });
    }
    const refundAmt = parseFloat(booking.total_amount || booking.total_price || 2800);
    await client.query(
      "UPDATE rental_bookings SET handover_status = 'Cancelled & Refunded' WHERE id = $1",
      [booking.id]
    );
    await client.query(`
      INSERT INTO wallet_transactions (role, tx_type, label, gross_amount, commission_amount, net_amount, balance_after)
      VALUES ('platform_revenue', 'refund', $1, $2, 0, $2, 0)
    `, [`Customer Refund - Self-Drive #${booking.tracking_code}`, -refundAmt]);
    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Self-drive reservation #${booking.tracking_code} cancelled and ₹${refundAmt.toLocaleString('en-IN')} has been refunded.`,
      refund_amount: refundAmt,
      status: 'Cancelled & Refunded'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to process refund', details: err.message });
  } finally {
    client.release();
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'app/src/main/assets/admin.html'));
});

// --- Multi-Stage Landmark & Region Photo Lookup ---
async function fetchLandmarkPhoto(rawName, fallbackRegion = '') {
  let primary = (rawName || '').split(',')[0].trim();
  const cleanFallback = (fallbackRegion || '').trim();

  if (/^\d+$/.test(primary) || /^nh\s*\d+$/i.test(primary)) {
    primary = cleanFallback || primary;
  }

  const userAgent = { headers: { 'User-Agent': 'TourEaseApp/1.0' } };

  const searchWikiImage = async (queryTerm) => {
    if (!queryTerm) return null;
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(queryTerm)}&gsrlimit=3&prop=pageimages|extracts&exintro&explaintext&exchars=140&pithumbsize=600&format=json&origin=*`;
      const res = await fetch(searchUrl, userAgent);
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data.query?.pages;
      if (pages) {
        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId];
          if (page.thumbnail?.source) {
            return {
              imageThumb: page.thumbnail.source,
              imageFull: page.thumbnail.source,
              description: page.extract ? page.extract.slice(0, 140) + '...' : `Explore ${primary || queryTerm}`
            };
          }
        }
      }
    } catch (err) { }
    return null;
  };

  if (primary) {
    try {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(primary)}`;
      const summaryRes = await fetch(summaryUrl, userAgent);
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        if (summaryData.thumbnail?.source) {
          return {
            imageThumb: summaryData.thumbnail.source,
            imageFull: summaryData.originalimage?.source || summaryData.thumbnail.source,
            description: summaryData.extract ? summaryData.extract.slice(0, 140) + '...' : `Explore ${primary}, India`
          };
        }
      }
    } catch (err) { }
  }

  if (primary) {
    const stage2Result = await searchWikiImage(`${primary} India`);
    if (stage2Result) return stage2Result;
  }

  if (cleanFallback && cleanFallback !== primary) {
    const stage3Result = await searchWikiImage(cleanFallback);
    if (stage3Result) return stage3Result;
  }

  return {
    imageThumb: null,
    imageFull: null,
    description: `Explore ${primary || cleanFallback || 'India'}`
  };
}

// Landmark Photo Lookup Route
app.get('/api/places/photo', async (req, res) => {
  const placeName = (req.query.name || '').trim();
  const region = (req.query.region || '').trim();
  if (!placeName && !region) return res.json({ imageThumb: null, imageFull: null, description: '' });

  try {
    const photoData = await fetchLandmarkPhoto(placeName, region);
    return res.json(photoData);
  } catch (err) {
    console.warn('Place photo lookup fallback:', err.message);
    res.json({ imageThumb: null, imageFull: null, description: `Explore ${placeName || region}` });
  }
});

// --- Curated City & Corridor Data for 3-Tier AI Concierge ---
const CURATED_CITY_DATA = {
  mumbai: {
    destination_spots: [
      { name: 'Gateway of India', lat: 18.9220, lng: 72.8347, best_time: '9:00 AM - 11:30 AM', entry_fee: 'Free', short_note: 'Iconic 26m arch monument overlooking Mumbai Harbour & Arabian Sea.' },
      { name: 'Marine Drive & Promenade', lat: 18.9432, lng: 72.8223, best_time: 'Sunset 5:30 PM - 7:30 PM', entry_fee: 'Free', short_note: 'The Queen\'s Necklace coastal promenade with sunset sea breezes.' },
      { name: 'Chhatrapati Shivaji Maharaj Terminus', lat: 18.9401, lng: 72.8358, best_time: '11:00 AM - 1:00 PM', entry_fee: 'Free', short_note: 'UNESCO World Heritage Victorian Gothic architectural masterpiece.' },
      { name: 'Siddhivinayak Temple', lat: 19.0169, lng: 72.8311, best_time: 'Morning 7:00 AM - 9:00 AM', entry_fee: 'Free (VIP ₹100)', short_note: 'Revered spiritual temple dedicated to Lord Ganesha in Prabhadevi.' },
      { name: 'Bandra-Worli Sea Link', lat: 19.0330, lng: 72.8183, best_time: 'Afternoon / Evening Drive', entry_fee: 'Toll ₹85', short_note: 'Modern 8-lane cable-stayed architectural wonder over Mahim Bay.' },
      { name: 'Colaba Causeway Bazaar', lat: 18.9186, lng: 72.8295, best_time: '3:00 PM - 6:00 PM', entry_fee: 'Free', short_note: 'Historic street market for handicrafts, vintage jewelry & legendary cafes.' },
      { name: 'Elephanta Caves', lat: 18.9633, lng: 72.9315, best_time: '10:00 AM - 2:00 PM', entry_fee: '₹40 (Ferry ₹260)', short_note: 'Ancient rock-cut cave temples dedicated to Shiva on Elephanta Island.' }
    ],
    restaurants: {
      under_budget: [
        { name: 'Bademiya Kebabs, Colaba', lat: 18.9228, lng: 72.8320, cuisine: 'Mughlai & Rolls', rating: '4.6★', price_for_two: '₹600' },
        { name: 'Kyani & Co. Irani Cafe', lat: 18.9430, lng: 72.8285, cuisine: 'Parsi Bun Maska & Chai', rating: '4.5★', price_for_two: '₹350' },
        { name: 'Sardar Refreshments, Tardeo', lat: 18.9680, lng: 72.8160, cuisine: 'Famous Extra Butter Pav Bhaji', rating: '4.7★', price_for_two: '₹400' }
      ],
      exact_budget: [
        { name: 'Trishna Seafood Restaurant, Fort', lat: 18.9288, lng: 72.8312, cuisine: 'Coastal Koli Seafood', rating: '4.8★', price_for_two: '₹1,800' },
        { name: 'Britannia & Co., Ballard Estate', lat: 18.9355, lng: 72.8390, cuisine: 'Authentic Berry Pulao', rating: '4.7★', price_for_two: '₹1,100' },
        { name: 'Mahesh Lunch Home, Fort', lat: 18.9320, lng: 72.8335, cuisine: 'Mangalorean Ghee Roast', rating: '4.6★', price_for_two: '₹1,500' }
      ],
      smart_upgrade: [
        { name: 'Wasabi by Morimoto (Taj Mahal Palace)', lat: 18.9217, lng: 72.8333, cuisine: 'Contemporary Japanese Fine Dining', rating: '4.9★', price_for_two: '₹5,500' },
        { name: 'The Table, Colaba', lat: 18.9235, lng: 72.8318, cuisine: 'Farm-to-Table Global Cuisine', rating: '4.8★', price_for_two: '₹3,800' },
        { name: 'Dome InterContinental, Marine Drive', lat: 18.9325, lng: 72.8220, cuisine: 'Rooftop Lounge & Cocktails', rating: '4.7★', price_for_two: '₹4,200' }
      ]
    },
    hotels: {
      under_budget: [
        { name: 'Hotel Suba Palace, Colaba', lat: 18.9240, lng: 72.8315, rating: '4.5★', price_per_night: '₹3,200/night', amenities: 'AC, Free Wi-Fi, 24/7 Desk, Heritage Walk' },
        { name: 'Residency Hotel Fort', lat: 18.9340, lng: 72.8340, rating: '4.4★', price_per_night: '₹3,500/night', amenities: 'Central Location, Complimentary Breakfast' }
      ],
      exact_budget: [
        { name: 'Fariyas Hotel, Colaba', lat: 18.9195, lng: 72.8290, rating: '4.7★', price_per_night: '₹5,800/night', amenities: 'Swimming Pool, Sea View, Fitness Centre, Multi-Cuisine Dining' },
        { name: 'The Gordon House Hotel, Colaba', lat: 18.9230, lng: 72.8322, rating: '4.6★', price_per_night: '₹6,200/night', amenities: 'Boutique Designer Suites, All Day Dining, Bar' }
      ],
      smart_upgrade: [
        { name: 'The Taj Mahal Palace, Mumbai', lat: 18.9217, lng: 72.8333, rating: '4.9★', price_per_night: '₹14,500/night', amenities: 'Sea-facing Heritage Wing, Butler Service, Luxury Spa, Ocean Pool' },
        { name: 'The Oberoi, Nariman Point', lat: 18.9270, lng: 72.8205, rating: '4.9★', price_per_night: '₹16,000/night', amenities: 'Panoramic Marine Drive Views, Michelin-calibre dining, Concierge' }
      ]
    }
  },
  bhopal: {
    destination_spots: [
      { name: 'Upper Lake (Bada Talab)', lat: 23.2500, lng: 77.3468, best_time: 'Sunset 5:00 PM - 7:00 PM', entry_fee: 'Free (Boating ₹150)', short_note: 'India\'s largest man-made lake with boating & waterfront boulevard.' },
      { name: 'Taj-ul-Masajid', lat: 23.2628, lng: 77.3934, best_time: '9:00 AM - 12:00 PM', entry_fee: 'Free', short_note: 'One of the largest mosques in Asia with pink minarets & marble domes.' },
      { name: 'Van Vihar National Park', lat: 23.2285, lng: 77.3719, best_time: '7:00 AM - 10:30 AM', entry_fee: '₹20 / person', short_note: 'Sprawling lakeside open-air wildlife sanctuary & safari park.' },
      { name: 'Bharat Bhavan Cultural Complex', lat: 23.2435, lng: 77.3888, best_time: '2:00 PM - 6:00 PM', entry_fee: '₹20', short_note: 'Multi-arts centre designed by Charles Correa overlooking the lake.' },
      { name: 'Sanchi Stupa Complex', lat: 23.4795, lng: 77.7397, best_time: '9:00 AM - 1:00 PM', entry_fee: '₹40 / person', short_note: 'Ancient UNESCO World Heritage Buddhist sanctuary founded by Emperor Ashoka.' },
      { name: 'Shaukat Mahal & Sadar Manzil', lat: 23.2570, lng: 77.4019, best_time: '11:00 AM - 2:00 PM', entry_fee: 'Free', short_note: 'Unique Indo-Gothic palace fusion built during the reign of the Begums.' }
    ],
    restaurants: {
      under_budget: [
        { name: 'Sharma & Vishnu Fast Food', lat: 23.2205, lng: 77.4310, cuisine: 'Bhopali Poha Jalebi & Chaat', rating: '4.7★', price_for_two: '₹200' },
        { name: 'Hakeem Hotel, MP Nagar', lat: 23.2330, lng: 77.4320, cuisine: 'Authentic Mughlai & Biryani', rating: '4.6★', price_for_two: '₹600' },
        { name: 'Wind & Waves Restaurant', lat: 23.2490, lng: 77.3850, cuisine: 'Lakeside Multi-cuisine', rating: '4.5★', price_for_two: '₹500' }
      ],
      exact_budget: [
        { name: 'Under the Mango Tree (Jehan Numa)', lat: 23.2428, lng: 77.3912, cuisine: 'Royal Bhopali Rezala & Kebabs', rating: '4.8★', price_for_two: '₹1,600' },
        { name: 'Shahnama, Jehan Numa Palace', lat: 23.2428, lng: 77.3912, cuisine: 'Multi-Cuisine Buffet & Grill', rating: '4.7★', price_for_two: '₹1,800' },
        { name: 'Mocha Cafe & Bar, Arera Colony', lat: 23.2100, lng: 77.4350, cuisine: 'Continental & Artisanal Coffee', rating: '4.6★', price_for_two: '₹1,200' }
      ],
      smart_upgrade: [
        { name: 'The General\'s Table (Jehan Numa Retreat)', lat: 23.2250, lng: 77.3680, cuisine: 'Slow-Cooked Organic Heritage Cuisine', rating: '4.9★', price_for_two: '₹3,200' },
        { name: 'Za-aiqa, Courtyard by Marriott', lat: 23.2350, lng: 77.4330, cuisine: 'Awadhi & Pan-Indian Fine Dining', rating: '4.8★', price_for_two: '₹2,800' }
      ]
    },
    hotels: {
      under_budget: [
        { name: 'Hotel Lake View Ashok', lat: 23.2450, lng: 77.3870, rating: '4.4★', price_per_night: '₹2,400/night', amenities: 'Lake View, Free Wi-Fi, Restaurant, Parking' },
        { name: 'Courtyard Bhopal Central', lat: 23.2335, lng: 77.4300, rating: '4.3★', price_per_night: '₹2,800/night', amenities: 'Clean AC Rooms, In-house Cafe' }
      ],
      exact_budget: [
        { name: 'Jehan Numa Palace Hotel', lat: 23.2428, lng: 77.3912, rating: '4.8★', price_per_night: '₹6,200/night', amenities: '19th-Century Royal Palace, Equestrian Track, Swimming Pool, Luxury Spa' },
        { name: 'Noor-Us-Sabah Palace', lat: 23.2750, lng: 77.3650, rating: '4.7★', price_per_night: '₹5,500/night', amenities: 'Hilltop Heritage Palace, Panoramic Lake Vistas, Mughal Gardens' }
      ],
      smart_upgrade: [
        { name: 'Jehan Numa Retreat, Van Vihar', lat: 23.2250, lng: 77.3680, rating: '4.9★', price_per_night: '₹10,500/night', amenities: 'Eco-Luxury Forest Cottages, Private Spa, Organic Farm, Chauffeur Service' },
        { name: 'Taj Lakefront, Bhopal', lat: 23.2200, lng: 77.3900, rating: '4.9★', price_per_night: '₹12,000/night', amenities: 'Infinity Lakeside Pool, Presidential Suites, Dedicated Concierge' }
      ]
    }
  }
};

const CORRIDOR_EN_ROUTE_STOPS = {
  'mumbai': [
    { name: 'Indore Chhappan Dukan', lat: 22.7230, lng: 75.8820, type: 'Culinary Heritage Stop', description: 'Legendary 56-shop food boulevard serving famous Malwa snacks.' },
    { name: 'Maheshwar Fort & Narmada Ghats', lat: 22.1764, lng: 75.5828, type: 'Heritage Fort & Ghats', description: 'Ancient Ahilyabai Holkar palace with intricate stone carvings over river Narmada.' },
    { name: 'Dhule Highway Oasis & EV Hub', lat: 20.9042, lng: 74.7749, type: 'Expressway Rest Plaza', description: 'Clean restrooms, EV fast charging, fuel, and multi-cuisine restaurant.' },
    { name: 'Igatpuri Western Ghats Lookout', lat: 19.6967, lng: 73.5606, type: 'Scenic Mountain Viewpoint', description: 'Misty mountain waterfalls and panoramic valley viewing halt.' }
  ],
  'bhopal': [
    { name: 'Dewas Chamunda Mata Tekri', lat: 22.9676, lng: 76.0534, type: 'Hilltop Temple & Viewpoint', description: 'Sacred hill shrine with ropeway and scenic vistas of Malwa plateau.' },
    { name: 'Ashta Highway Rest Plaza', lat: 23.0200, lng: 76.7200, type: 'Rest & Refreshment Plaza', description: 'Clean family washrooms, fuel station, and fresh Malwa snacks.' },
    { name: 'Sehore Crescent Water Park', lat: 23.2000, lng: 77.0800, type: 'Scenic Roadside Halt', description: 'Lush greenery, coffee lounge, and highway travelers retreat.' }
  ]
};

// AI Travel Planner Route with Universal 3-Tier Budget Calibration
app.post('/api/ai/plan-trip', async (req, res) => {
  const { destination, days, interests, prompt: userPrompt, budget, duration, travelers, origin } = req.body;
  const targetDestination = destination || userPrompt || 'Mumbai';
  const originCity = origin || 'Ujjain';
  const targetDays = days || duration || '2 Days';
  const travelerCount = travelers ? `${travelers} travelers` : '4 travelers';
  const numBudget = Math.max(1000, parseFloat(budget) || 20000);

  const destKey = (targetDestination || '').toLowerCase().trim();
  const matchedKey = Object.keys(CURATED_CITY_DATA).find(k => destKey.includes(k)) || 'mumbai';
  const cityData = CURATED_CITY_DATA[matchedKey] || CURATED_CITY_DATA.mumbai;
  const enRouteData = CORRIDOR_EN_ROUTE_STOPS[matchedKey] || CORRIDOR_EN_ROUTE_STOPS.mumbai;

  // Compute 3 Calibrated Tiers
  const costUnder = Math.round(numBudget * 0.82); // strictly 75%-90% of B
  const costExact = Math.round(numBudget);         // strictly <= B
  const costUpgrade = Math.round(numBudget + 4000); // strictly B + ₹3k to ₹5k

  try {
    const aiPrompt = `You are India's premier travel architect. Create a realistic, highly detailed ${targetDays} travel itinerary from "${originCity}" to "${targetDestination}" for ${travelerCount} with a baseline user budget B = ₹${numBudget}.
You MUST generate 3 budget-calibrated plan options:
1. "under_budget": Total cost strictly between 75% and 90% of B (around ₹${costUnder}, save ₹${numBudget - costUnder}).
2. "exact_budget": Total cost strictly <= B (around ₹${costExact}).
3. "smart_upgrade": Total cost strictly B + ₹3,000 to B + ₹5,000 (around ₹${costUpgrade}), including an explicit "upgrade_perks" array explaining what the extra ₹4,000 unlocks.

For EACH of the 3 options, provide REAL, VERIFIABLE places with exact decimal [lat, lng] coordinates (NO generic placeholders):
- "en_route_spots": 3 to 4 real highway/midpoint heritage, viewpoint, or rest stops between ${originCity} and ${targetDestination} with name, lat (float), lng (float), type, and description.
- "destination_spots": 5 to 7 real famous tourist attractions inside ${targetDestination} with name, lat (float), lng (float), best_time, entry_fee, and short_note.
- "restaurants": 3 to 4 real named restaurants or cafes in ${targetDestination} with name, lat (float), lng (float), cuisine, rating, and price_for_two.
- "hotels": 2 to 3 real named hotels in ${targetDestination} with name, lat (float), lng (float), rating, price_per_night, and amenities.
- "itinerary": Day-by-day markdown text describing morning, afternoon, and evening activities.

Provide the response strictly in JSON format with top-level key "options" containing "under_budget", "exact_budget", "smart_upgrade".`;

    let options = null;

    try {
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: aiPrompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const cleanJson = (response.text || '').replace(/```(?:json)?\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed && parsed.options) {
        options = parsed.options;
      }
    } catch (aiErr) {
      console.warn('Gemini 3-tier generation notice:', aiErr.message);
    }

    // Build or normalize robust 3-tier structure
    const makeTier = (tierName, cost, savings, perks, restTier, hotelTier, titleTag) => {
      const opt = (options && options[tierName]) || {};
      return {
        tier: tierName,
        title: titleTag.title,
        tag: titleTag.tag,
        total_cost: cost,
        savings: savings || 0,
        upgrade_perks: perks || [],
        en_route_spots: (opt.en_route_spots && opt.en_route_spots.length) ? opt.en_route_spots : enRouteData,
        destination_spots: (opt.destination_spots && opt.destination_spots.length) ? opt.destination_spots : cityData.destination_spots,
        restaurants: (opt.restaurants && opt.restaurants.length) ? opt.restaurants : (cityData.restaurants[restTier] || cityData.restaurants.exact_budget),
        hotels: (opt.hotels && opt.hotels.length) ? opt.hotels : (cityData.hotels[hotelTier] || cityData.hotels.exact_budget),
        itinerary: opt.itinerary || `### ${titleTag.title} — ${targetDestination} (${targetDays}, ${travelerCount})\n\n- **Day 1**: Departure from ${originCity}, transit via scenic highway stops, hotel check-in, and evening local exploration.\n- **Day 2**: Full-day guided sightseeing of iconic landmarks, regional dining, and sunset viewpoint.\n\n*Budget Calibrated: ₹${cost.toLocaleString('en-IN')} (Target: ₹${numBudget.toLocaleString('en-IN')})*`
      };
    };

    const finalOptions = {
      under_budget: makeTier(
        'under_budget',
        costUnder,
        numBudget - costUnder,
        [],
        'under_budget',
        'under_budget',
        { title: 'Smart Saver Corridor', tag: `VALUE TIER • SAVE ₹${(numBudget - costUnder).toLocaleString('en-IN')}` }
      ),
      exact_budget: makeTier(
        'exact_budget',
        costExact,
        0,
        [],
        'exact_budget',
        'exact_budget',
        { title: 'Balanced Premium Corridor', tag: `RECOMMENDED • EXACT ₹${costExact.toLocaleString('en-IN')}` }
      ),
      smart_upgrade: makeTier(
        'smart_upgrade',
        costUpgrade,
        0,
        [
          'Private executive AC SUV upgrade with zero surge and personal chauffeur',
          '4-Star boutique heritage stay with complimentary breakfast & evening high tea',
          'Skip-the-line VIP passes to key monuments & guided heritage walk',
          'Reserved dining at award-winning authentic local chef restaurants'
        ],
        'smart_upgrade',
        'smart_upgrade',
        { title: 'Luxury Executive Corridor', tag: `SMART UPGRADE • +₹4,000` }
      )
    };

    const defaultSpots = finalOptions.exact_budget.destination_spots;

    res.json({
      success: true,
      options: finalOptions,
      destination_places: defaultSpots,
      locations: defaultSpots,
      corridor_stops: finalOptions.exact_budget.en_route_spots,
      itinerary: finalOptions.exact_budget.itinerary
    });
  } catch (err) {
    console.error('AI plan-trip error:', err.message);
    const fallbackTier = {
      tier: 'exact_budget',
      title: 'Balanced Premium Corridor',
      tag: `RECOMMENDED • ₹${numBudget.toLocaleString('en-IN')}`,
      total_cost: numBudget,
      en_route_spots: enRouteData,
      destination_spots: cityData.destination_spots,
      restaurants: cityData.restaurants.exact_budget,
      hotels: cityData.hotels.exact_budget,
      itinerary: `### Curated ${targetDestination} Plan (${targetDays}, ${travelerCount})\n\n- **Day 1**: Scenic transit from ${originCity}, midpoint rest stop, hotel check-in & landmark visits.\n- **Day 2**: Cultural attractions, waterfront promenade & famous regional culinary stops.`
    };
    res.json({
      success: true,
      options: {
        under_budget: { ...fallbackTier, tier: 'under_budget', title: 'Smart Saver Corridor', tag: `VALUE TIER • ₹${costUnder.toLocaleString('en-IN')}`, total_cost: costUnder, savings: numBudget - costUnder },
        exact_budget: fallbackTier,
        smart_upgrade: { ...fallbackTier, tier: 'smart_upgrade', title: 'Luxury Executive Corridor', tag: `SMART UPGRADE • ₹${costUpgrade.toLocaleString('en-IN')}`, total_cost: costUpgrade, upgrade_perks: ['Executive SUV with chauffeur', '4-Star heritage hotel upgrade', 'VIP darshan & monument skip-the-line passes'] }
      },
      destination_places: cityData.destination_spots,
      locations: cityData.destination_spots,
      itinerary: fallbackTier.itinerary
    });
  }
});

// --- Dynamic Interactive Route Alternatives API ---
const FALLBACK_CITIES = {
  bhopal: { name: 'Bhopal', lng: 77.4020, lat: 23.2584, place_name: 'Bhopal, Madhya Pradesh, India' },
  mumbai: { name: 'Mumbai', lng: 72.8787, lat: 19.0778, place_name: 'Mumbai, Maharashtra, India' },
  ujjain: { name: 'Ujjain', lng: 75.7682, lat: 23.1824, place_name: 'Ujjain, Madhya Pradesh, India' },
  indore: { name: 'Indore', lng: 75.8577, lat: 22.7196, place_name: 'Indore, Madhya Pradesh, India' },
  pachmarhi: { name: 'Pachmarhi', lng: 78.4344, lat: 22.4674, place_name: 'Pachmarhi, Madhya Pradesh, India' },
  delhi: { name: 'Delhi', lng: 77.2090, lat: 28.6139, place_name: 'Delhi, India' },
  jaipur: { name: 'Jaipur', lng: 75.7873, lat: 26.9124, place_name: 'Jaipur, Rajasthan, India' },
  pune: { name: 'Pune', lng: 73.8567, lat: 18.5204, place_name: 'Pune, Maharashtra, India' },
  nashik: { name: 'Nashik', lng: 73.7898, lat: 19.9975, place_name: 'Nashik, Maharashtra, India' }
};

async function geocodeMapbox(query, mapboxToken) {
  if (!query || !mapboxToken) return null;
  try {
    const cleanQ = query.replace(/\(.*?\)/g, '').trim();
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQ)}.json?country=IN&proximity=75.7682,23.1824&types=place,locality,poi,address&limit=1&access_token=${mapboxToken}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.features && d.features.length > 0) {
      const f = d.features[0];
      return {
        name: f.text || cleanQ,
        place_name: f.place_name,
        lng: f.center[0],
        lat: f.center[1]
      };
    }
  } catch (err) {
    console.warn(`Mapbox geocode error for "${query}":`, err.message);
  }
  return null;
}

function computeBounds(coords) {
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return [[minLng, minLat], [maxLng, maxLat]];
}

app.post('/api/concierge/routes', async (req, res) => {
  let { prompt, origin, destination, days, travelers, budget } = req.body;

  // Auto-parse origin and destination from prompt if not explicitly passed
  if ((!origin || !destination) && prompt) {
    let cleanPrompt = prompt.replace(/^round-trip\s+(from\s+)?/i, '').replace(/^trip\s+(from\s+)?/i, '').trim();
    const match = cleanPrompt.match(/(?:from\s+)?(.+?)\s+to\s+(.+?)(?:, returning to.*|$)/i);
    if (match) {
      if (!origin) origin = match[1].trim();
      if (!destination) destination = match[2].trim();
    } else if (!destination) {
      destination = cleanPrompt;
      if (!origin) origin = 'Bhopal';
    }
  }
  if (!origin) origin = 'Bhopal';
  if (!destination) destination = 'Mumbai';

  const numBudget = parseFloat(budget) || 20000;
  const numTravelers = parseInt(travelers) || 4;
  const numDays = parseInt(days) || 3;
  const mapboxToken = process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '';

  let originGeo = await geocodeMapbox(origin, mapboxToken);
  let destGeo = await geocodeMapbox(destination, mapboxToken);

  if (!originGeo) {
    const key = origin.toLowerCase().trim();
    originGeo = FALLBACK_CITIES[key] || { name: origin, lng: 77.4020, lat: 23.2584, place_name: origin };
  }
  if (!destGeo) {
    const key = destination.toLowerCase().trim();
    destGeo = FALLBACK_CITIES[key] || { name: destination, lng: 72.8787, lat: 19.0778, place_name: destination };
  }

  // Fetch routes from Mapbox Directions API
  let mapboxRoutes = [];
  try {
    if (mapboxToken) {
      const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${originGeo.lng},${originGeo.lat};${destGeo.lng},${destGeo.lat}?alternatives=true&geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;
      const rRes = await fetch(dirUrl);
      if (rRes.ok) {
        const rData = await rRes.json();
        if (rData.routes && rData.routes.length > 0) {
          mapboxRoutes = rData.routes;
        }
      }
    }
  } catch (dirErr) {
    console.warn('Mapbox Directions error:', dirErr.message);
  }

  // Try fetching 3rd route via waypoint if we only have 2
  let waypointRoute = null;
  try {
    if (mapboxToken && mapboxRoutes.length < 3) {
      const midLng = (originGeo.lng + destGeo.lng) / 2 + 0.35;
      const midLat = (originGeo.lat + destGeo.lat) / 2 - 0.45;
      const wpUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${originGeo.lng},${originGeo.lat};${midLng.toFixed(4)},${midLat.toFixed(4)};${destGeo.lng},${destGeo.lat}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
      const wpRes = await fetch(wpUrl);
      if (wpRes.ok) {
        const wpData = await wpRes.json();
        if (wpData.routes && wpData.routes.length > 0) {
          waypointRoute = wpData.routes[0];
        }
      }
    }
  } catch (wpErr) { }

  // Construct fallback straight-ish interpolated route geometry if no Mapbox routes
  const fallbackCoords1 = [
    [originGeo.lng, originGeo.lat],
    [75.7682, 21.8],
    [74.7749, 20.9042],
    [73.5606, 19.6967],
    [destGeo.lng, destGeo.lat]
  ];
  const fallbackCoords2 = [
    [originGeo.lng, originGeo.lat],
    [75.8577, 22.7196],
    [75.5828, 22.1764],
    [73.7898, 19.9975],
    [destGeo.lng, destGeo.lat]
  ];
  const fallbackCoords3 = [
    [originGeo.lng, originGeo.lat],
    [76.2947, 21.4646],
    [76.2294, 21.3145],
    [73.4839, 19.6582],
    [destGeo.lng, destGeo.lat]
  ];

  const constructedRoutes = [];

  function snapMidpointsToCoordinates(coords, templates) {
    if (!coords || coords.length === 0) return templates;
    const p25 = coords[Math.floor(coords.length * 0.25)] || coords[0];
    const p50 = coords[Math.floor(coords.length * 0.50)] || coords[Math.floor(coords.length / 2)];
    const p75 = coords[Math.floor(coords.length * 0.75)] || coords[coords.length - 1];
    const pts = [p25, p50, p75];
    return templates.map((t, idx) => {
      const pt = pts[idx] || pts[pts.length - 1];
      return {
        ...t,
        lng: Number(pt[0].toFixed(5)),
        lat: Number(pt[1].toFixed(5))
      };
    });
  }

  const destCityKey = (destGeo.name || destination || '').toLowerCase().trim();
  const matchedCityKey = Object.keys(CURATED_CITY_SIGHTSEEING).find(k => destCityKey.includes(k)) || 'mumbai';
  const citySightseeingPlaces = (CURATED_CITY_SIGHTSEEING[matchedCityKey] || CURATED_CITY_SIGHTSEEING.mumbai).map((p, idx) => ({
    ...p,
    id: `place-${idx + 1}`,
    number: idx + 1,
    destination: destGeo.name
  }));

  // Route 1: Fastest Expressway Corridor
  const r0 = mapboxRoutes[0];
  const coords0 = r0?.geometry?.coordinates || fallbackCoords1;
  const dist0 = r0 ? Math.round(r0.distance / 1000) : 908;
  const dur0 = r0 ? (r0.duration / 3600).toFixed(1) : '15.7';
  constructedRoutes.push({
    id: 'route-0',
    title: 'Fastest Expressway Corridor',
    tag: `FASTEST CORRIDOR • ${dist0} KM`,
    via: 'via NH52 & Samruddhi Mahamarg',
    distance_km: dist0,
    duration_hrs: dur0,
    estimated_cost: numBudget,
    geometry: { type: 'LineString', coordinates: coords0 },
    bounds: computeBounds(coords0),
    origin: { name: originGeo.name, lng: originGeo.lng, lat: originGeo.lat },
    destination: { name: destGeo.name, lng: destGeo.lng, lat: destGeo.lat },
    destination_places: citySightseeingPlaces,
    midpoints: snapMidpointsToCoordinates(coords0, [
      { name: 'Dhule Highway Oasis & EV Hub', type: 'Rest & Fuel Plaza', description: 'EV fast charging, 24/7 food court & clean family washrooms.', lat: 20.9042, lng: 74.7749 },
      { name: 'Samruddhi Expressway Junction', type: 'Expressway Gateway', description: 'High-speed 120 km/h access expressway corridor.', lat: 20.1000, lng: 74.1200 },
      { name: 'Igatpuri Valley Lookout', type: 'Scenic Viewpoint', description: 'Misty Western Ghats mountain vistas & hot chai halts.', lat: 19.6967, lng: 73.5606 }
    ]),
    stays_and_dining: [
      { name: 'Hotel Panchratna Executive, Dhule', type: 'Expressway Transit Stay', rating: '4.7★', price_est: '₹2,200/night', desc: 'Secure parking, EV charging, 24/7 dining & modern AC rooms.' },
      { name: 'Vithal Kamat Highway Restaurant', type: 'Highway Pure Veg Dining', rating: '4.5★', price_est: '₹280/person', desc: 'Fresh filter coffee, hot misal pav & clean family amenities.' }
    ]
  });

  // Route 2: Scenic Heritage & Hill-Stop Route
  const r1 = mapboxRoutes[1];
  const coords1 = r1?.geometry?.coordinates || fallbackCoords2;
  const dist1 = r1 ? Math.round(r1.distance / 1000) : 790;
  const dur1 = r1 ? (r1.duration / 3600).toFixed(1) : '15.9';
  constructedRoutes.push({
    id: 'route-1',
    title: 'Scenic Heritage & Vineyard Route',
    tag: `SCENIC ROUTE • ${dist1} KM`,
    via: 'via Indore, Maheshwar Ghats & Nashik',
    distance_km: dist1,
    duration_hrs: dur1,
    estimated_cost: numBudget,
    geometry: { type: 'LineString', coordinates: coords1 },
    bounds: computeBounds(coords1),
    origin: { name: originGeo.name, lng: originGeo.lng, lat: originGeo.lat },
    destination: { name: destGeo.name, lng: destGeo.lng, lat: destGeo.lat },
    destination_places: citySightseeingPlaces,
    midpoints: snapMidpointsToCoordinates(coords1, [
      { name: 'Maheshwar Fort & Narmada Ghats', type: 'Heritage Stop', description: 'Centuries-old stone carvings & Ahilya fort riverside views.', lat: 22.1764, lng: 75.5828 },
      { name: 'Sula Vineyards, Nashik', type: 'Vineyard & Leisure', description: 'Rolling grape vineyards, wine tastings & open-air Italian garden.', lat: 19.9975, lng: 73.7898 },
      { name: 'Trimbakeshwar Jyotirlinga', type: 'Spiritual Shrine', description: 'Sacred ancient shrine nestled beneath Brahmagiri hills.', lat: 19.9328, lng: 73.5308 }
    ]),
    stays_and_dining: [
      { name: 'The Source at Sula, Nashik', type: 'Vineyard Resort', rating: '4.8★', price_est: '₹5,500/night', desc: 'Tuscan-style boutique villas, infinity pool, winery tours & tastings.' },
      { name: 'Little Italy Sula Vineyards', type: 'Italian & Mediterranean', rating: '4.6★', price_est: '₹650/person', desc: 'Wood-fired artisanal pizzas & terrace dining overlooking vineyards.' }
    ]
  });

  // Route 3: Cultural & Artisan Discovery Trail
  const r2 = waypointRoute || mapboxRoutes[2];
  const coords2 = r2?.geometry?.coordinates || fallbackCoords3;
  const dist2 = r2 ? Math.round(r2.distance / 1000) : 871;
  const dur2 = r2 ? (r2.duration / 3600).toFixed(1) : '18.6';
  constructedRoutes.push({
    id: 'route-2',
    title: 'Cultural Heritage & Artisan Trail',
    tag: `HERITAGE CORRIDOR • ${dist2} KM`,
    via: 'via Burhanpur Gateway & Western Ghats Pass',
    distance_km: dist2,
    duration_hrs: dur2,
    estimated_cost: numBudget,
    geometry: { type: 'LineString', coordinates: coords2 },
    bounds: computeBounds(coords2),
    origin: { name: originGeo.name, lng: originGeo.lng, lat: originGeo.lat },
    destination: { name: destGeo.name, lng: destGeo.lng, lat: destGeo.lat },
    destination_places: citySightseeingPlaces,
    midpoints: snapMidpointsToCoordinates(coords2, [
      { name: 'Asirgarh Fort Citadel', type: 'Historic Citadel', description: 'Historic Deccan gateway citadel with panoramic valley ramparts.', lat: 21.4646, lng: 76.2947 },
      { name: 'Burhanpur Shahi Qila & Hammam', type: 'Mughal Architecture', description: 'Intricate royal baths & ancient historic silk trading bazaars.', lat: 21.3145, lng: 76.2294 },
      { name: 'Kasara Ghats Rainforest Pass', type: 'Mountain Pass', description: 'Dramatic winding cliff roads & panoramic Western Ghats waterfalls.', lat: 19.6582, lng: 73.4839 }
    ]),
    stays_and_dining: [
      { name: 'Hotel Grand Sivaji, Burhanpur', type: 'City Center Heritage Stay', rating: '4.6★', price_est: '₹2,100/night', desc: 'Comfortable business suites, heritage tour guides & fine multicuisine dining.' },
      { name: 'Khandesh Shev Bhaji & Jowar Roti House', type: 'Authentic Regional Dining', rating: '4.8★', price_est: '₹250/person', desc: 'Authentic spicy Khandeshi Shev Bhaji with jowar bhakri and chilled buttermilk.' }
    ]
  });

  res.json({
    success: true,
    origin: originGeo,
    destination: destGeo,
    travelers: numTravelers,
    duration_days: numDays,
    budget: numBudget,
    destination_places: citySightseeingPlaces,
    routes: constructedRoutes
  });
});

const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT} with PostgreSQL connection`);
});

// Also serve full app & APIs on 5500 for testing & preview tools
const staticApp = express();
staticApp.use(cors());
staticApp.use(app);
const staticServer = staticApp.listen(5500, HOST, () => {
  console.log(`Static preview server running on http://${HOST}:5500`);
});
staticServer.on('error', (e) => {
  console.log('Port 5500 note:', e.message);
});

// Keep process alive continuously
server.on('error', (err) => {
  console.error('HTTP Server Error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
