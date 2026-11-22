const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const screenshotsDir = path.join(__dirname, 'audit_screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('--- Starting TourEase Public-Readiness Playwright Audit (390x844) ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', request => {
    networkErrors.push(`${request.method()} ${request.url()} - ${request.failure() ? request.failure().errorText : 'Failed'}`);
  });

  console.log('Navigating to http://localhost:5500/index1.html ...');
  await page.goto('http://localhost:5500/index1.html', { waitUntil: 'networkidle' });

  // Handle first-time login modal if displayed
  const authModal = await page.$('#authModal');
  if (authModal && await authModal.isVisible()) {
    console.log('Auth modal detected, clicking Google Login & selecting Traveler role...');
    const btnGoogleLogin = await page.$('#btnGoogleLogin');
    if (btnGoogleLogin) await btnGoogleLogin.click();
    await page.waitForTimeout(500);

    const roleChoiceTraveler = await page.$('#roleChoiceTraveler');
    if (roleChoiceTraveler && await roleChoiceTraveler.isVisible()) {
      await roleChoiceTraveler.click();
      await page.waitForTimeout(500);
    }
  }

  // 1. Traveler -> Concierge Screen
  console.log('Auditing 1: Traveler Concierge Screen...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotsDir, '01_concierge_top.png') });

  // Scroll down map and prompt
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotsDir, '02_concierge_prompt_map.png') });

  // Test Satellite Toggle
  const btnToggleMap = await page.$('#btnToggleMapStyle');
  if (btnToggleMap) {
    console.log('Clicking Satellite Toggle...');
    await btnToggleMap.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '03_concierge_satellite.png') });
    await btnToggleMap.click(); // revert
    await page.waitForTimeout(1000);
  }

  // Test Auto-expanding textarea & AI Generation
  const promptInput = await page.$('#conciergePromptInput');
  if (promptInput) {
    console.log('Typing into prompt textarea...');
    await promptInput.fill('Trip for 3 people to Ujjain and Pachmarhi with budget ₹45,000 for 3 Days');
    await page.waitForTimeout(500);
  }

  const btnGenerate = await page.$('#btnGenerateConcierge');
  if (btnGenerate) {
    console.log('Clicking Generate AI Itinerary...');
    await btnGenerate.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(screenshotsDir, '04_concierge_ai_results.png') });
  }

  // 2. Traveler -> Tours Tab
  console.log('Auditing 2: Traveler Tours Tab...');
  const toursNavBtn = await page.$('.traveler-nav-btn[data-tab="tab-tours"]');
  if (toursNavBtn) {
    await toursNavBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '05_tours_list.png') });

    // Open first timeline accordion
    const toggleAccordion = await page.$('.tour-timeline-toggle-btn');
    if (toggleAccordion) {
      console.log('Expanding tour timeline accordion...');
      await toggleAccordion.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, '06_tours_expanded_timeline.png') });
    }

    // Open Tour Booking Drawer
    const bookPkgBtn = await page.$('.tour-package-card button:has-text("Book Tour Package")');
    if (bookPkgBtn) {
      console.log('Opening Tour Booking Drawer...');
      await bookPkgBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '07_tours_booking_modal.png') });

      // Change travelers count to 3
      const travelersSelect = await page.$('#pkgTravelersCountSelect');
      if (travelersSelect) {
        await travelersSelect.selectOption('3');
        await page.waitForTimeout(500);
      }

      // Confirm booking
      const btnConfirmPkg = await page.$('#btnConfirmPackageBooking');
      if (btnConfirmPkg) {
        console.log('Confirming Tour Package Booking...');
        await btnConfirmPkg.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotsDir, '08_tours_booked_history.png') });
      }
    }
  }

  // 3. Traveler -> Cabs Tab
  console.log('Auditing 3: Traveler Cabs Tab...');
  const cabsNavBtn = await page.$('.traveler-nav-btn[data-tab="tab-cabs"]');
  if (cabsNavBtn) {
    await cabsNavBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '09_cabs_fleet_list.png') });

    // Book first cab
    const bookCabBtn = await page.$('.nearby-cab-card button:has-text("Book this Cab")');
    if (bookCabBtn) {
      console.log('Booking cab...');
      await bookCabBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '10_cabs_active_ride.png') });

      // Complete Ride & open checkout
      const btnEndRide = await page.$('#btnSimulateRideEnd');
      if (btnEndRide) {
        console.log('Opening Cab Checkout modal...');
        await btnEndRide.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotsDir, '11_cabs_checkout_modal.png') });

        // Toggle to Online then back to Cash
        const toggleOnline = await page.$('#modalPayToggleOnline');
        if (toggleOnline) {
          await toggleOnline.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(screenshotsDir, '12_cabs_checkout_online.png') });
        }

        const toggleCash = await page.$('#modalPayToggleCash');
        if (toggleCash) {
          await toggleCash.click();
          await page.waitForTimeout(500);
        }

        // Confirm cash payment request
        const btnConfirmPay = await page.$('#btnConfirmModalPayment');
        if (btnConfirmPay) {
          console.log('Confirming cash payment request...');
          await btnConfirmPay.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: path.join(screenshotsDir, '13_cabs_waiting_cash_banner.png') });
        }
      }
    }
  }

  // 4. Traveler -> Rentals Tab & SOS Tab
  console.log('Auditing 4: Rentals & SOS Tabs...');
  const rentalsNavBtn = await page.$('.traveler-nav-btn[data-tab="tab-rentals"]');
  if (rentalsNavBtn) {
    await rentalsNavBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '14_rentals_fleet.png') });

    // Open Reserve Self-Drive modal
    const btnReserve = await page.$('.rental-car-card button:has-text("Reserve Self-Drive")');
    if (btnReserve) {
      console.log('Opening Reserve Self-Drive Modal...');
      await btnReserve.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '15_rentals_reservation_modal.png') });

      // Close modal
      const btnCloseSd = await page.$('#btnCloseSelfDriveModal');
      if (btnCloseSd) await btnCloseSd.click();
      await page.waitForTimeout(500);
    }
  }

  const sosNavBtn = await page.$('.traveler-nav-btn[data-tab="tab-sos"]');
  if (sosNavBtn) {
    console.log('Auditing SOS Emergency Tab...');
    await sosNavBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '16_sos_emergency_screen.png') });
  }

  // 5. Cab Owner & Rental Vendor Role Switcher
  console.log('Auditing 5: Cab Owner & Rental Vendor Roles...');
  const roleSelector = await page.$('#roleSelector');
  if (roleSelector) {
    console.log('Switching to Cab Owner role...');
    await roleSelector.selectOption('cab_owner');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '17_cab_owner_dashboard.png') });

    // Handle Cab Owner KYC onboarding form if displayed
    const kycGateCard = await page.$('#cabOwnerKycGateCard');
    if (kycGateCard && await kycGateCard.isVisible()) {
      console.log('Submitting Cab Owner KYC onboarding...');
      const btnSubmitCabKyc = await page.$('#btnSubmitCabKyc');
      if (btnSubmitCabKyc) await btnSubmitCabKyc.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '17_b_cab_owner_kyc_unlocked.png') });
    }

    // Check if pending cash approval button exists and confirm it
    const btnConfirmDriverCash = await page.$('#btnConfirmDriverCashReceived');
    if (btnConfirmDriverCash && await btnConfirmDriverCash.isVisible()) {
      console.log('Clicking Confirm Cash Received as Cab Owner...');
      await btnConfirmDriverCash.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '18_cab_owner_cash_settled.png') });
    }

    console.log('Switching to Rental Vendor role...');
    await roleSelector.selectOption('rental_vendor');
    await page.waitForTimeout(1500);

    const vendorKycGateCard = await page.$('#vendorKycGateCard');
    if (vendorKycGateCard && await vendorKycGateCard.isVisible()) {
      console.log('Submitting Rental Vendor KYC onboarding...');
      const btnSubmitVendorKyc = await page.$('#btnSubmitVendorKyc');
      if (btnSubmitVendorKyc) await btnSubmitVendorKyc.click();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: path.join(screenshotsDir, '19_rental_vendor_dashboard.png') });
  }

  console.log('--- Audit Run Completed ---');
  console.log(`Console Errors (${consoleErrors.length}):`, consoleErrors);
  console.log(`Network Failures (${networkErrors.length}):`, networkErrors);

  await browser.close();
})();

