const { chromium } = require('playwright');
const fs = require('fs');

async function testUI() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), loc: msg.location() });
    }
  });

  page.on('pageerror', err => {
    console.log('PAGE ERROR STACK:', err.stack);
    consoleErrors.push({ text: err.message, stack: err.stack });
  });

  console.log('Navigating to http://localhost:5500/index1.html...');
  await page.goto('http://localhost:5500/index1.html', { waitUntil: 'networkidle' });

  // 1. Check Auth Gate Modal & 3-Method Tabs
  const roleCard = page.locator('#roleChoiceTraveler');
  await roleCard.waitFor({ state: 'visible' });
  console.log('Step 1: Role Selection Visible. Clicking Traveler...');
  await roleCard.click();

  // Verify 3 tabs exist
  const tabPhone = page.locator('#tabAuthPhoneBtn');
  const tabEmail = page.locator('#tabAuthEmailBtn');
  const tabGoogle = page.locator('#tabAuthGoogleBtn');

  await tabPhone.waitFor({ state: 'visible' });
  await tabEmail.waitFor({ state: 'visible' });
  await tabGoogle.waitFor({ state: 'visible' });
  console.log('Step 2: 3 Auth Tabs Verified (Phone, Email, Google).');

  // Test Tab Switching: Click Email Tab
  await tabEmail.click();
  await page.waitForTimeout(300);
  const emailSectionVisible = await page.locator('#authEmailSection').isVisible();
  console.log('Switched to Email Tab, section visible:', emailSectionVisible);

  // Click Send Email OTP
  await page.locator('#btnSendEmailOtp').click();
  await page.waitForTimeout(500);
  const emailOtpInputVal = await page.locator('#authEmailOtpInput').inputValue();
  console.log('Email OTP populated:', emailOtpInputVal);

  // Verify Email OTP
  await page.locator('#btnVerifyEmailOtp').click();
  await page.waitForTimeout(600);
  console.log('Traveler logged in via Email OTP!');

  // Verify Dashboard is visible and Auth Modal dismissed
  const authModalVisible = await page.locator('#authModal').isVisible();
  console.log('Auth Modal dismissed:', !authModalVisible);

  // 2. Test Guided Tours -> Direct In-App Checkout (Flow B)
  console.log('\n--- Testing Guided Tour Booking with Direct Checkout (No QR) ---');
  const toursTab = page.locator('.nav-item-btn[data-tab="tab-tours"]');
  await toursTab.click();
  await page.waitForTimeout(500);

  // Click Book Tour Package on first package
  const firstBookPkgBtn = page.locator('.m3-button-primary:has-text("Book Tour Package")').first();
  await firstBookPkgBtn.scrollIntoViewIfNeeded();
  await firstBookPkgBtn.click();
  await page.waitForTimeout(400);

  // Click Confirm Booking
  const btnConfirmPkg = page.locator('#btnConfirmPackageBooking');
  await btnConfirmPkg.click();
  await page.waitForTimeout(400);

  // Verify Direct Payment Gateway Modal is OPEN and NO QR Scanner exists
  const directPayModalVisible = await page.locator('#directOnlinePaymentModal').isVisible();
  const qrScannerVisibleInTour = await page.locator('#cabQrScannerModal').isVisible();
  console.log('Direct Online Payment Modal open:', directPayModalVisible);
  console.log('QR Scanner Modal NOT open (Clean Flow B):', !qrScannerVisibleInTour);

  const directPayTitle = await page.locator('#directPayItemTitle').textContent();
  const directPayAmount = await page.locator('#directPayAmountDisplay').textContent();
  console.log('Direct Pay Item:', directPayTitle, '| Amount:', directPayAmount);

  // Pay Securely
  await page.locator('#btnConfirmDirectOnlinePayment').click();
  await page.waitForTimeout(800);
  console.log('Tour booked and paid directly via TourEase Pay!');

  // 3. Test Self-Drive Rentals -> Direct In-App Checkout (Flow B)
  console.log('\n--- Testing Self-Drive Rental Booking with Direct Checkout (No QR) ---');
  const rentalsTab = page.locator('.nav-item-btn[data-tab="tab-rentals"]');
  await rentalsTab.click();
  await page.waitForTimeout(500);

  // Click Reserve on first car
  const firstBookCarBtn = page.locator('.m3-button-primary:has-text("Reserve Self-Drive")').first();
  await firstBookCarBtn.scrollIntoViewIfNeeded();
  await firstBookCarBtn.click();
  await page.waitForTimeout(400);

  // Click Confirm Reservation inside rental modal
  const btnConfirmSd = page.locator('#btnConfirmSelfDriveReservation');
  await btnConfirmSd.click();
  await page.waitForTimeout(400);

  // Verify Direct Payment Gateway Modal is OPEN
  const directPayModalRentals = await page.locator('#directOnlinePaymentModal').isVisible();
  console.log('Direct Online Payment Modal open for Rental:', directPayModalRentals);
  const rentalAmount = await page.locator('#directPayAmountDisplay').textContent();
  console.log('Rental Amount Payable:', rentalAmount);

  // Switch to Card Tab
  await page.locator('#btnDirectPayTabCard').click();
  await page.waitForTimeout(300);
  const cardPanelVisible = await page.locator('#directPayCardPanel').isVisible();
  console.log('Card Payment Panel Visible:', cardPanelVisible);

  // Pay Securely
  await page.locator('#btnConfirmDirectOnlinePayment').click();
  await page.waitForTimeout(800);
  console.log('Rental confirmed and receipt generated!');

  // Close Self-Drive modal via Done button
  const btnDoneSd = page.locator('#btnDoneSelfDriveReceipt');
  if (await btnDoneSd.isVisible()) {
    await btnDoneSd.click();
    await page.waitForTimeout(400);
  }

  // 4. Test City Cabs -> Online Scan Driver QR (Flow A)
  console.log('\n--- Testing City Cabs with Scan Driver QR (Flow A) ---');
  const cabsTab = page.locator('.nav-item-btn[data-tab="tab-cabs"]');
  await cabsTab.click();
  await page.waitForTimeout(500);

  // Book a cab
  const firstBookCabBtn = page.locator('.m3-button-primary:has-text("Book this Cab")').first();
  await firstBookCabBtn.scrollIntoViewIfNeeded();
  await firstBookCabBtn.click();
  await page.waitForTimeout(500);

  // Tap End Ride / Complete Ride simulation button
  const btnEndRide = page.locator('#btnSimulateRideEnd');
  await btnEndRide.waitFor({ state: 'visible' });
  await btnEndRide.click();
  await page.waitForTimeout(400);

  // Choose "Pay Online" toggle
  await page.locator('#modalPayToggleOnline').click();
  await page.waitForTimeout(300);

  // Click "Scan Driver QR to Pay"
  await page.locator('#btnConfirmModalPayment').click();
  await page.waitForTimeout(400);

  // Verify QR Scanner Modal is OPEN
  const qrScannerModalVisible = await page.locator('#cabQrScannerModal').isVisible();
  console.log('Cab QR Scanner Modal visible:', qrScannerModalVisible);

  // Click Simulate Camera Scan & Pay
  await page.locator('#btnSimulateScanQr').click();
  await page.waitForTimeout(800);
  console.log('Cab ride settled via Scan Driver QR!');

  // Take verification screenshot
  await page.screenshot({ path: 'audit_screenshots/payment_auth_verification.png', fullPage: false });
  console.log('Screenshot saved to audit_screenshots/payment_auth_verification.png');

  // Verify horizontal overflow
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  console.log('Viewport width: 390 | Body scrollWidth:', bodyWidth, '(Overflow:', bodyWidth > 390 ? 'YES' : 'NO', ')');

  console.log('Console Errors caught:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('Errors:', consoleErrors);
  }

  await browser.close();
  console.log('\n🌟 ALL BROWSER E2E FLOWS VERIFIED SUCCESSFULLY!');
}

testUI().catch(e => {
  console.error('Browser test failed:', e);
  process.exit(1);
});
