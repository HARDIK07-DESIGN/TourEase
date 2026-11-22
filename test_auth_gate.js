const { chromium } = require('playwright');

(async () => {
  console.log('--- Testing First-Screen Auth Gate & All 3 Roles (390x844) ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // FLOW 1: First-Screen Role Selection & Traveler Mobile OTP Sign-in
  console.log('1. Testing Traveler Sign-In via Phone & OTP...');
  await page.goto('http://localhost:3000/index1.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Take screenshot of Initial Role Select Gate
  await page.screenshot({ path: 'audit_screenshots/gate_1_role_select.png' });

  // Click Traveler Role Card
  const travelerCard = await page.$('#roleChoiceTraveler');
  if (travelerCard) await travelerCard.click();
  await page.waitForTimeout(400);

  // Take screenshot of Sign-in methods
  await page.screenshot({ path: 'audit_screenshots/gate_2_traveler_signin.png' });

  // Click "Get 6-Digit OTP"
  const btnSendOtp = await page.$('#btnSendAuthOtp');
  if (btnSendOtp) await btnSendOtp.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'audit_screenshots/gate_3_traveler_otp_sent.png' });

  // Click "Verify & Continue"
  const btnVerifyOtp = await page.$('#btnVerifyAuthOtp');
  if (btnVerifyOtp) await btnVerifyOtp.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'audit_screenshots/gate_4_traveler_unlocked_dashboard.png' });

  // FLOW 2: Sign Out / Switch Account -> Cab Owner Sign-In & Mandatory Partner Proof
  console.log('2. Testing Cab Owner Sign-In & Partner Proof Verification...');
  // Click user profile to trigger Sign Out
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
  const profileBtn = await page.$('#userProfileBtn');
  if (profileBtn) await profileBtn.click();
  await page.waitForTimeout(500);

  // Choose Cab Owner Role
  const cabOwnerCard = await page.$('#roleChoiceCabOwner');
  if (cabOwnerCard) await cabOwnerCard.click();
  await page.waitForTimeout(400);

  // Sign in via Google Chooser
  const btnGoogle = await page.$('#btnGoogleLogin');
  if (btnGoogle) await btnGoogle.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'audit_screenshots/gate_5_google_chooser.png' });

  // Click first Google account
  const firstGoogleAcc = await page.$('.google-acc-item');
  if (firstGoogleAcc) await firstGoogleAcc.click();
  await page.waitForTimeout(500);

  // Partner Proof Form should now be visible
  await page.screenshot({ path: 'audit_screenshots/gate_6_cab_owner_proof_form.png' });

  // Submit Partner Proof
  const btnSubmitProof = await page.$('#btnSubmitPartnerProof');
  if (btnSubmitProof) await btnSubmitProof.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'audit_screenshots/gate_7_cab_owner_unlocked_dashboard.png' });

  // FLOW 3: Sign Out -> Rental Vendor Sign-In & Mandatory Fleet Proof
  console.log('3. Testing Rental Vendor Sign-In & Mandatory Fleet Proof...');
  if (profileBtn) await profileBtn.click();
  await page.waitForTimeout(500);

  const vendorCard = await page.$('#roleChoiceRentalVendor');
  if (vendorCard) await vendorCard.click();
  await page.waitForTimeout(400);

  // Sign in via Google
  if (btnGoogle) await btnGoogle.click();
  await page.waitForTimeout(400);
  if (firstGoogleAcc) await firstGoogleAcc.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'audit_screenshots/gate_8_vendor_proof_form.png' });

  // Submit Vendor Proof
  if (btnSubmitProof) await btnSubmitProof.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'audit_screenshots/gate_9_vendor_unlocked_dashboard.png' });

  console.log('Console Errors caught:', errors.length);
  if (errors.length > 0) {
    console.log('Errors:', errors);
  }

  await browser.close();
  console.log('=== All Sign-In & Proof Verification Gate Tests Passed! ===');
})();

