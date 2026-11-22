require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SUV_THAR_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%"><rect width="600" height="360" fill="#F1F5F9"/><rect x="70" y="140" width="460" height="120" rx="20" fill="#1E293B"/><polygon points="120,140 180,60 410,60 470,140" fill="#334155"/><rect x="190,75" width="95" height="55" rx="6" fill="#93C5FD"/><rect x="300,75" width="100" height="55" rx="6" fill="#93C5FD"/><circle cx="170" cy="260" r="46" fill="#0F172A"/><circle cx="170" cy="260" r="22" fill="#94A3B8"/><circle cx="430" cy="260" r="46" fill="#0F172A"/><circle cx="430" cy="260" r="22" fill="#94A3B8"/><rect x="495" y="110" width="30" height="80" rx="12" fill="#0F172A"/><text x="300" y="335" font-family="sans-serif" font-size="20" font-weight="bold" fill="#475569" text-anchor="middle">MAHINDRA THAR 4x4 (HARD TOP)</text></svg>`);

const EV_NEXON_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%"><rect width="600" height="360" fill="#F0FDFA"/><rect x="60" y="150" width="480" height="110" rx="24" fill="#0F766E"/><path d="M120,150 Q200,65 310,65 Q430,65 480,150 Z" fill="#115E59"/><rect x="200,80" width="100" height="60" rx="8" fill="#99F6E4"/><rect x="315,80" width="105" height="60" rx="8" fill="#99F6E4"/><circle cx="160" cy="260" r="44" fill="#134E4A"/><circle cx="160" cy="260" r="20" fill="#5EEAD4"/><circle cx="440" cy="260" r="44" fill="#134E4A"/><circle cx="440" cy="260" r="20" fill="#5EEAD4"/><text x="300" y="335" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0F766E" text-anchor="middle">TATA NEXON EV MAX (LONG RANGE)</text></svg>`);

const SUV_CRETA_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%"><rect width="600" height="360" fill="#EFF6FF"/><rect x="65" y="145" width="470" height="115" rx="22" fill="#1D4ED8"/><path d="M130,145 L200,70 L400,70 L475,145 Z" fill="#1E40AF"/><rect x="210,82" width="85" height="53" rx="6" fill="#BFDBFE"/><rect x="310,82" width="95" height="53" rx="6" fill="#BFDBFE"/><circle cx="165" cy="260" r="44" fill="#1E3A8A"/><circle cx="165" cy="260" r="20" fill="#93C5FD"/><circle cx="435" cy="260" r="44" fill="#1E3A8A"/><circle cx="435" cy="260" r="20" fill="#93C5FD"/><text x="300" y="335" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1D4ED8" text-anchor="middle">HYUNDAI CRETA SX (O)</text></svg>`);

const TOUR_SPIRITUAL_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%"><defs><linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#D97706"/><stop offset="100%" stop-color="#78350F"/></linearGradient></defs><rect width="800" height="480" fill="url(#spGrad)"/><polygon points="400,80 470,300 330,300" fill="#FDE68A"/><polygon points="400,40 430,90 370,90" fill="#F59E0B"/><polygon points="260,180 310,320 210,320" fill="#FCD34D"/><polygon points="540,180 590,320 490,320" fill="#FCD34D"/><path d="M0,320 Q200,280 400,320 T800,320 L800,480 L0,480 Z" fill="#92400E"/><path d="M0,360 Q200,330 400,360 T800,360 L800,480 L0,480 Z" fill="#451A03"/><text x="400" y="420" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FEF3C7" text-anchor="middle">UJJAIN &bull; OMKARESHWAR JYOTIRLINGA</text><text x="400" y="450" font-family="sans-serif" font-size="18" fill="#FDE68A" text-anchor="middle">Twin Sanctum River Circuit &bull; 2 Days</text></svg>`);

const TOUR_FOOD_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%"><defs><linearGradient id="fdGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#DC2626"/><stop offset="100%" stop-color="#991B1B"/></linearGradient></defs><rect width="800" height="480" fill="url(#fdGrad)"/><rect x="250" y="100" width="300" height="240" rx="16" fill="#FEE2E2"/><polygon points="230,100 400,30 570,100" fill="#FEF2F2"/><rect x="280" y="140" width="60" height="90" rx="8" fill="#EF4444"/><rect x="370" y="140" width="60" height="90" rx="8" fill="#EF4444"/><rect x="460" y="140" width="60" height="90" rx="8" fill="#EF4444"/><circle cx="200" cy="300" r="50" fill="#F59E0B"/><circle cx="600" cy="300" r="50" fill="#F59E0B"/><text x="400" y="400" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" text-anchor="middle">INDORE GOURMET &amp; MIDNIGHT FOOD</text><text x="400" y="435" font-family="sans-serif" font-size="18" fill="#FCA5A5" text-anchor="middle">Chappan Dukan &bull; Sarafa Night Bazaar &bull; 1 Evening</text></svg>`);

const TOUR_HERITAGE_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%"><defs><linearGradient id="hgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0284C7"/><stop offset="100%" stop-color="#0369A1"/></linearGradient></defs><rect width="800" height="480" fill="url(#hgGrad)"/><rect x="180" y="160" width="440" height="160" rx="8" fill="#F0F9FF"/><polygon points="180,160 220,100 260,160" fill="#BAE6FD"/><polygon points="360,160 400,80 440,160" fill="#BAE6FD"/><polygon points="540,160 580,100 620,160" fill="#BAE6FD"/><path d="M0,320 Q200,290 400,320 T800,320 L800,480 L0,480 Z" fill="#0C4A6E"/><text x="400" y="415" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" text-anchor="middle">MALWA HERITAGE &amp; MAHESHWAR FORT</text><text x="400" y="445" font-family="sans-serif" font-size="18" fill="#BAE6FD" text-anchor="middle">Royal Stone Ghats &bull; Handloom Weavers &bull; 1 Day</text></svg>`);

(async () => {
  await pool.query(`
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
      subtitle TEXT,
      duration_days INT DEFAULT 2,
      price NUMERIC(10,2) NOT NULL,
      category TEXT DEFAULT 'Custom AI Itinerary',
      description TEXT,
      itinerary TEXT,
      stops_json JSONB,
      image_data TEXT,
      submitted_by VARCHAR(255) DEFAULT 'Traveler',
      is_approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bill_dispatches (
      id SERIAL PRIMARY KEY,
      tracking_code TEXT NOT NULL,
      channel VARCHAR(32) NOT NULL,
      recipient TEXT NOT NULL,
      fare_breakdown JSONB,
      dispatched_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('TRUNCATE tour_bookings, cab_rides, rental_bookings, wallet_transactions, custom_ai_packages, bill_dispatches CASCADE');
  await pool.query('TRUNCATE tour_packages, rental_fleet CASCADE');
  await pool.query('DELETE FROM kyc_profiles');

  // Seed tour packages with clean SVG art
  await pool.query(`
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

  // Seed rental fleet with clean vector SVGs
  await pool.query(`
    INSERT INTO rental_fleet (car_model, plate_number, model_year, daily_rate, seats, transmission, image_url, image_data, is_compliant) VALUES
    ('Mahindra Thar 4x4 (Hard Top)', 'MP-09-TH-2024', 2024, 3800.00, 4, 'Automatic 4x4', $1, $1, TRUE),
    ('Tata Nexon EV Max', 'MP-09-EV-2023', 2023, 2600.00, 5, 'Electric Drive', $2, $2, TRUE),
    ('Hyundai Creta SX (O)', 'MP-09-CR-2024', 2024, 2900.00, 5, 'Automatic IVT', $3, $3, TRUE)
  `, [SUV_THAR_SVG, EV_NEXON_SVG, SUV_CRETA_SVG]);

  // Reset wallet balances
  await pool.query("UPDATE wallet_accounts SET total_balance = 1500.00, withdrawable_balance = 1000.00 WHERE role = 'cab_owner'");
  await pool.query("UPDATE wallet_accounts SET total_balance = 0.00, withdrawable_balance = 0.00 WHERE role = 'rental_vendor'");

  console.log('PostgreSQL demo seed state cleanly reset with clean vector SVGs (zero Unsplash).');
  await pool.end();
})().catch(e => {
  console.error('Reset error:', e);
  process.exit(1);
});
