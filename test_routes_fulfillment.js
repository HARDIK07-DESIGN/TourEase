const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const screenshotsDir = path.join(__dirname, 'audit_screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('--- Testing TourEase Multi-Route & Fulfillment Engine (390x844) ---');
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
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('dialog', async dialog => {
    console.log('Dialog message:', dialog.message().slice(0, 80) + '...');
    await dialog.accept();
  });

  console.log('Navigating to http://localhost:3000/index1.html ...');
  await page.goto('http://localhost:3000/index1.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // If Auth modal visible, sign in as Traveler
  const authModal = await page.$('#authModal');
  if (authModal && await authModal.isVisible()) {
    console.log('Authenticating as Traveler...');
    const travelerCard = await page.$('#roleChoiceTraveler');
    if (travelerCard && await travelerCard.isVisible()) {
      await travelerCard.click();
      await page.waitForTimeout(400);
    }
    const btnSendOtp = await page.$('#btnSendAuthOtp');
    if (btnSendOtp && await btnSendOtp.isVisible()) {
      await btnSendOtp.click();
      await page.waitForTimeout(400);
    }
    const btnVerifyOtp = await page.$('#btnVerifyAuthOtp');
    if (btnVerifyOtp && await btnVerifyOtp.isVisible()) {
      await btnVerifyOtp.click();
      await page.waitForTimeout(800);
    }
  }

  // Check initial map
  await page.screenshot({ path: path.join(screenshotsDir, '01_initial_clean_map.png') });
  console.log('Captured: 01_initial_clean_map.png');

  // Verify inputs
  const promptVal = await page.$eval('#conciergePromptInput', el => el.value);
  const budgetVal = await page.$eval('#conciergeBudgetInput', el => el.value);
  const durationVal = await page.$eval('#conciergeDurationInput', el => el.value);
  const travelersVal = await page.$eval('#conciergeTravelersInput', el => el.value);
  console.log('Input values:', { promptVal, budgetVal, durationVal, travelersVal });

  // Click Generate AI Itinerary
  console.log('Clicking #btnGenerateConcierge ...');
  await page.click('#btnGenerateConcierge');

  // Wait for routes section
  console.log('Waiting for #conciergeRoutesSection ...');
  await page.waitForSelector('#conciergeRoutesSection', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(screenshotsDir, '02_route_alternatives_rendered.png') });
  console.log('Captured: 02_route_alternatives_rendered.png');

  const routeCards = await page.$$('#conciergeRouteCardsList .route-alt-card');
  console.log('Total Route Alternative Cards rendered:', routeCards.length);

  // Click Option 2 to switch selection
  if (routeCards.length > 1) {
    console.log('Clicking Route Alternative 2 (Scenic Heritage)...');
    await routeCards[1].click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '03_route_2_selected.png') });
    console.log('Captured: 03_route_2_selected.png');
  }

  // Click Apply This Route on Route 1
  console.log('Clicking Apply This Route on Option 1...');
  const applyBtn1 = await page.$('.btn-apply-route[data-route-index="0"]');
  if (applyBtn1) {
    await applyBtn1.click();
    await page.waitForSelector('#routeFulfillmentModal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '04_fulfillment_modal_open.png') });
    console.log('Captured: 04_fulfillment_modal_open.png');

    // Check Path B qualifying cars
    const pathBCars = await page.$$('#pathBSelfDriveCarsContainer .btn-book-path-b-car');
    console.log('Path B Qualifying Self-Drive cars available:', pathBCars.length);

    if (pathBCars.length > 0) {
      console.log('Clicking Book Self-Drive on vehicle 1...');
      await pathBCars[0].click();
      await page.waitForTimeout(1500);
    }
  }

  // Also test Path A booking
  console.log('Testing Path A Guided Tour booking...');
  const applyBtn2 = await page.$('.btn-apply-route[data-route-index="1"]');
  if (applyBtn2) {
    await applyBtn2.click();
    await page.waitForSelector('#routeFulfillmentModal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    const btnBookPathA = await page.$('#btnBookPathAGuidedTour');
    if (btnBookPathA) {
      await btnBookPathA.click();
      await page.waitForTimeout(1500);
    }
  }

  await page.screenshot({ path: path.join(screenshotsDir, '05_final_state.png') });
  console.log('Captured: 05_final_state.png');

  console.log('Console Errors during session:', consoleErrors);
  await browser.close();
  console.log('--- Test Complete ---');
  process.exit(0);
})();
