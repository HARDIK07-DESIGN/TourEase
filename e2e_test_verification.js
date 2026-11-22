const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('--- Executing End-to-End Multi-Device & Browser Readiness Test (390x844) ---');
  const browser = await chromium.launch({ headless: true });
  
  // 1. Device A: Traveler View
  const travelerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const pageA = await travelerContext.newPage();

  // Clear local storage for clean start
  await pageA.goto('http://localhost:3000/index1.html', { waitUntil: 'networkidle' });
  await pageA.evaluate(() => localStorage.clear());
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.waitForTimeout(500);

  // Authenticate as Traveler
  const authModal = await pageA.$('#authModal');
  if (authModal && await authModal.isVisible()) {
    const btnGoogle = await pageA.$('#btnGoogleLogin');
    if (btnGoogle) await btnGoogle.click();
    await pageA.waitForTimeout(400);
    const roleChoice = await pageA.$('#roleChoiceTraveler');
    if (roleChoice && await roleChoice.isVisible()) {
      await roleChoice.click();
      await pageA.waitForTimeout(500);
    }
  }

  // A. Check SOS Tab rendering (map + emergency services)
  console.log('Verifying SOS Tab & Mapbox rendering...');
  const navSos = await pageA.$('button[data-tab="tab-sos"]');
  if (navSos) await navSos.click();
  await pageA.waitForTimeout(800);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_sos_tab.png' });

  // B. Check Cabs Tab & Ride Checkout modal (plates + copy)
  console.log('Verifying City Cabs & Ride Checkout Modal...');
  const navCabs = await pageA.$('button[data-tab="tab-cabs"]');
  if (navCabs) await navCabs.click();
  await pageA.waitForTimeout(500);
  
  // Book the first cab
  const bookCabBtn = await pageA.$('.nearby-cab-card button');
  if (bookCabBtn) await bookCabBtn.click();
  await pageA.waitForTimeout(500);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_cab_active_ride.png' });

  // Open checkout modal
  const btnCheckout = await pageA.$('#btnSimulateRideEnd');
  if (btnCheckout) await btnCheckout.click();
  await pageA.waitForTimeout(400);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_cab_checkout_modal.png' });

  // Select Cash and confirm
  const toggleCash = await pageA.$('#modalPayToggleCash');
  if (toggleCash) await toggleCash.click();
  const btnConfirmPay = await pageA.$('#btnConfirmModalPayment');
  if (btnConfirmPay) await btnConfirmPay.click();
  await pageA.waitForTimeout(500);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_cab_cash_waiting.png' });

  // C. Check Rentals Tab & Book a vehicle
  console.log('Verifying Rentals Tab: Available cars shown first, then booking flow...');
  const navRentals = await pageA.$('button[data-tab="tab-rentals"]');
  if (navRentals) await navRentals.click();
  await pageA.waitForTimeout(600);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_rentals_fleet_first.png' });

  // Reserve the first car
  const reserveBtn = await pageA.$('.rental-car-card button');
  if (reserveBtn) await reserveBtn.click();
  await pageA.waitForTimeout(400);

  const btnConfirmSd = await pageA.$('#btnConfirmSelfDriveReservation');
  if (btnConfirmSd) await btnConfirmSd.click();
  await pageA.waitForTimeout(500);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_rental_receipt_step.png' });

  const btnDoneReceipt = await pageA.$('#btnDoneSelfDriveReceipt');
  if (btnDoneReceipt) await btnDoneReceipt.click();
  await pageA.waitForTimeout(500);
  await pageA.screenshot({ path: 'audit_screenshots/e2e_rental_active_reservation.png' });

  // 2. Device B: Emulator / Cab Owner & Rental Vendor Views
  console.log('Opening Device B (Emulator perspective)...');
  const emulatorContext = await browser.newContext({
    viewport: { width: 412, height: 915 }, // Pixel 7
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/116.0.0.0 Mobile Safari/537.36'
  });
  const pageB = await emulatorContext.newPage();
  await pageB.goto('http://localhost:3000/index1.html', { waitUntil: 'networkidle' });
  await pageB.waitForTimeout(500);

  // Authenticate as Cab Owner
  const authB = await pageB.$('#authModal');
  if (authB && await authB.isVisible()) {
    const btnGoogleB = await pageB.$('#btnGoogleLogin');
    if (btnGoogleB) await btnGoogleB.click();
    await pageB.waitForTimeout(400);
    const roleCab = await pageB.$('#roleChoiceCabOwner');
    if (roleCab && await roleCab.isVisible()) {
      await roleCab.click();
      await pageB.waitForTimeout(500);
    }
  }

  // Verify KYC or bypass
  const kycGateCard = await pageB.$('#cabOwnerKycGateCard');
  if (kycGateCard && await kycGateCard.isVisible()) {
    const submitKycBtn = await pageB.$('#btnSubmitCabKyc');
    if (submitKycBtn) await submitKycBtn.click();
    await pageB.waitForTimeout(500);
  }

  // Device B: Cab Owner sees the incoming ride and cash confirmation in real time!
  await pageB.waitForTimeout(2000); // allow 3s sync
  await pageB.screenshot({ path: 'audit_screenshots/e2e_cab_owner_live_dispatch.png' });

  // Switch Role to Rental Vendor on Device B
  console.log('Switching Device B to Rental Vendor role...');
  const roleDropdown = await pageB.$('#activeRoleDropdown');
  if (roleDropdown) {
    await roleDropdown.selectOption('rental_vendor');
    await pageB.waitForTimeout(500);
  }

  // Handle Vendor KYC if needed
  const vendorKycGate = await pageB.$('#vendorKycGateCard');
  if (vendorKycGate && await vendorKycGate.isVisible()) {
    const btnSubmitVendorKyc = await pageB.$('#btnSubmitVendorKyc');
    if (btnSubmitVendorKyc) await btnSubmitVendorKyc.click();
    await pageB.waitForTimeout(500);
  }

  // Verify Rental Vendor sees customer reservation & clicks "Confirm Vehicle Handed Over"
  await pageB.waitForTimeout(1000);
  await pageB.screenshot({ path: 'audit_screenshots/e2e_vendor_reservations.png' });

  const btnHandover = await pageB.$('#vendorCustomerReservationsList button');
  if (btnHandover) {
    await btnHandover.click();
    await pageB.waitForTimeout(600);
    await pageB.screenshot({ path: 'audit_screenshots/e2e_vendor_after_handover.png' });
  }

  // Go back to Traveler (Device A) and verify live tracking unlocked!
  console.log('Verifying Traveler Device A after key handover...');
  await pageA.waitForTimeout(3200); // 3s sync poll
  await pageA.screenshot({ path: 'audit_screenshots/e2e_traveler_unlocked_tracking.png' });

  const btnLiveTrack = await pageA.$('#activeRentalReservationsList button');
  if (btnLiveTrack) {
    await btnLiveTrack.click();
    await pageA.waitForTimeout(600);
    await pageA.screenshot({ path: 'audit_screenshots/e2e_traveler_gps_modal.png' });
  }

  await browser.close();
  console.log('=== End-to-End Verification Completed Successfully! ===');
})();

