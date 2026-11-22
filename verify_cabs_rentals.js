const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:5500/index1.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Auto-login flow matching audit_runner.js
  const authModal = await page.$('#authModal');
  if (authModal && await authModal.isVisible()) {
    const btnGoogleLogin = await page.$('#btnGoogleLogin');
    if (btnGoogleLogin) await btnGoogleLogin.click();
    await page.waitForTimeout(500);

    const roleChoiceTraveler = await page.$('#roleChoiceTraveler');
    if (roleChoiceTraveler && await roleChoiceTraveler.isVisible()) {
      await roleChoiceTraveler.click();
      await page.waitForTimeout(500);
    }
  }

  // 1. Switch to City Cabs
  const cabNavBtn = await page.$('button[data-tab="tab-cabs"]');
  if (cabNavBtn) await cabNavBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'audit_screenshots/city_cabs_fixed.png', fullPage: true });

  // 2. Switch to Rentals
  const rentalNavBtn = await page.$('button[data-tab="tab-rentals"]');
  if (rentalNavBtn) await rentalNavBtn.click();
  await page.waitForTimeout(600);
  
  // Click 'Reserve Self-Drive' on first car
  const reserveBtn = await page.$('.rental-car-card button');
  if (reserveBtn) {
    await reserveBtn.click();
    await page.waitForTimeout(500);
    // Click 'Pay & Confirm Reservation'
    const confirmBtn = await page.$('#btnConfirmSelfDriveReservation');
    if (confirmBtn) await confirmBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'audit_screenshots/rental_receipt_modal.png' });
    
    // Click Done to see active reservation card in rentals tab
    const doneBtn = await page.$('#btnDoneSelfDriveReceipt');
    if (doneBtn) await doneBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'audit_screenshots/rentals_with_active_card.png', fullPage: true });
  }

  await browser.close();
  console.log('Audits completed and screenshots captured successfully.');
})();
