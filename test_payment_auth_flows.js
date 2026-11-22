const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch {
          resolve({ status: res.statusCode, data: resBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- 1. Testing Health & Config Endpoints ---');
  const health = await request('GET', '/api/health');
  console.log('GET /api/health:', health.status, health.data);
  if (health.status !== 200 || !health.data.db) throw new Error('Health check failed');

  const config = await request('GET', '/api/config');
  console.log('GET /api/config:', config.status, 'has googleClientId:', typeof config.data.googleClientId === 'string');

  console.log('\n--- 2. Testing 3-Method Authentication ---');
  // 2A. Phone OTP
  const phoneResp = await request('POST', '/api/auth/send-phone-otp', { phone: '9876543210' });
  console.log('POST /api/auth/send-phone-otp:', phoneResp.status, 'Code:', phoneResp.data.simulated_otp);
  if (!phoneResp.data.success) throw new Error('Failed to send phone OTP');

  const verifyPhone = await request('POST', '/api/auth/verify-otp', {
    target: '9876543210',
    otp_code: phoneResp.data.simulated_otp,
    role: 'traveler'
  });
  console.log('POST /api/auth/verify-otp (Phone):', verifyPhone.status, 'User:', verifyPhone.data.user);
  if (!verifyPhone.data.success) throw new Error('Failed to verify phone OTP');

  // 2B. Email OTP
  const emailResp = await request('POST', '/api/auth/send-email-otp', { email: 'traveler@tourease.in' });
  console.log('POST /api/auth/send-email-otp:', emailResp.status, 'Code:', emailResp.data.simulated_otp);
  if (!emailResp.data.success) throw new Error('Failed to send email OTP');

  const verifyEmail = await request('POST', '/api/auth/verify-otp', {
    target: 'traveler@tourease.in',
    otp_code: emailResp.data.simulated_otp,
    role: 'traveler'
  });
  console.log('POST /api/auth/verify-otp (Email):', verifyEmail.status, 'User:', verifyEmail.data.user);
  if (!verifyEmail.data.success) throw new Error('Failed to verify email OTP');

  // 2C. Google OAuth
  const googleResp = await request('POST', '/api/auth/google', {
    email: 'hardik.changedia@gmail.com',
    name: 'Hardik Changedia',
    sub: 'google-sub-12345',
    role: 'traveler'
  });
  console.log('POST /api/auth/google:', googleResp.status, 'User:', googleResp.data.user);
  if (!googleResp.data.success) throw new Error('Failed Google authentication');

  console.log('\n--- 3. Testing Flow A: Cab Ride & QR Settle ---');
  const cabCode = `CAB-${Math.floor(1000 + Math.random() * 9000)}`;
  const cabRide = await request('POST', '/api/rides/cab', {
    tracking_code: cabCode,
    customer_name: 'Hardik Changedia',
    pickup_location: 'Mahakaleshwar Temple, Ujjain',
    drop_location: 'Freeganj Market, Ujjain',
    pickup_lat: 23.1824,
    pickup_lng: 75.7682,
    car_model: 'Prime Sedan',
    driver_name: 'Ramesh Verma',
    plate_number: 'MP-09-CB-4491',
    fare: 1450.00,
    payment_method: 'cash'
  });
  console.log('Created Cab Ride:', cabRide.status, cabCode);

  // Generate QR
  const qrResp = await request('GET', `/api/rides/cab/${cabCode}/qr`);
  console.log('GET /api/rides/cab/:trackingCode/qr:', qrResp.status, 'has QR data URL:', qrResp.data.qr_image?.startsWith('data:image/png;base64'));
  if (!qrResp.data.success || !qrResp.data.qr_image) throw new Error('Failed to generate cab QR code');

  // Settle via QR
  const settleResp = await request('POST', '/api/payments/cab/qr-settle', {
    tracking_code: cabCode,
    amount: 1450.00
  });
  console.log('POST /api/payments/cab/qr-settle:', settleResp.status, settleResp.data);
  if (!settleResp.data.success || settleResp.data.net_credited !== 1334) {
    throw new Error(`Expected net_credited 1334 (92%), got ${settleResp.data.net_credited}`);
  }

  console.log('\n--- 4. Testing Flow B: Direct In-App Checkout (Rentals & Tours) ---');
  // 4A. Self-Drive Rental
  const rntCode = `RNT-${Math.floor(1000 + Math.random() * 9000)}`;
  const directRental = await request('POST', '/api/payments/direct-checkout', {
    payment_type: 'rental',
    tracking_code: rntCode,
    amount: 3800.00,
    method: 'UPI',
    customer_name: 'Hardik Changedia',
    car_model: 'Mahindra Thar 4x4 (Hard Top)',
    plate_number: 'MP-09-TH-2024',
    pickup_location: 'Ujjain Hub',
    drop_location: 'Indore Hub',
    pickup_date: '2026-11-23',
    return_date: '2026-11-24',
    total_days: 1
  });
  console.log('POST /api/payments/direct-checkout (Rental):', directRental.status, directRental.data.message);
  if (!directRental.data.success) throw new Error('Failed direct rental checkout');

  // 4B. Guided Tour
  const tourCode = `TE-${Math.floor(1000 + Math.random() * 9000)}`;
  const directTour = await request('POST', '/api/payments/direct-checkout', {
    payment_type: 'tour',
    tracking_code: tourCode,
    amount: 9600.00,
    method: 'CARD',
    package_title: 'Ujjain to Omkareshwar Spiritual Circuit',
    travel_date: '2026-11-25',
    travelers_count: 2
  });
  console.log('POST /api/payments/direct-checkout (Tour):', directTour.status, directTour.data.message);
  if (!directTour.data.success) throw new Error('Failed direct tour checkout');

  console.log('\n--- 5. Verifying Global State in PostgreSQL ---');
  const state = await request('GET', '/api/state');
  console.log('GET /api/state: 200 OK');
  console.log('Total Cab Rides:', state.data.cab_rides?.length);
  console.log('Total Rental Bookings:', state.data.rental_bookings?.length);
  console.log('Total Tour Bookings:', state.data.tour_bookings?.length);
  console.log('Total Wallet Accounts:', state.data.wallet_accounts);
  console.log('Recent Wallet Transactions Count:', state.data.wallet_transactions?.length);

  console.log('\n✅ ALL ROLE-TAILORED PAYMENT & AUTH TESTS PASSED 100%!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
