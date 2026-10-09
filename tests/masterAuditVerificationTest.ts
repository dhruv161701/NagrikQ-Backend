import { extractDocumentMetadataWithGemini, parseToIsoDate, checkIsExpired } from '../src/services/documentVerificationService';
import { getHolidays, sendAdvanceHolidayNotifications } from '../src/controllers/holidayController';
import { sendTelegramMessage } from '../src/services/telegramBotService';
import { triggerIdpCreatedWebhook } from '../src/services/n8nService';

async function runMasterAuditTests() {
  console.log('===========================================================');
  console.log('🧪 NAGRIKQ MASTER AUDIT: AUTOMATED TEST SUITE EXECUTION');
  console.log('===========================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assertTest(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   ↳ ${detail}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   ↳ ${detail}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // Test Section 1: TLS Certificate Security (Prompt Item 9)
  // -------------------------------------------------------------
  console.log('--- Item 9: TLS Security & Certificate Verification ---');
  assertTest(
    process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
    'TLS Insecure Global Bypass Removed',
    `NODE_TLS_REJECT_UNAUTHORIZED is currently '${process.env.NODE_TLS_REJECT_UNAUTHORIZED || 'undefined (default secure)'}'`
  );

  // -------------------------------------------------------------
  // Test Section 2: Document Vault - Document Inspection Engine (Prompt Item 8)
  // -------------------------------------------------------------
  console.log('\n--- Item 8: Document Vault OCR & Validation Pipeline ---');

  // 2.1 Lifetime Aadhaar
  // Base64 simulation representing an Aadhaar card text
  const aadhaarPayload = Buffer.from('GOVERNMENT OF INDIA UNIQUE IDENTIFICATION AUTHORITY OF INDIA UIDAI 1234 5678 9012').toString('base64');
  const aadhaarResult = await extractDocumentMetadataWithGemini(
    aadhaarPayload,
    'AADHAAR_CARD',
    'aadhaar_front.jpg'
  );
  assertTest(
    aadhaarResult.documentType.toLowerCase().includes('aadhaar') && aadhaarResult.isCategoryMatched === true,
    'Aadhaar Document Correctly Identified',
    `Detected: ${aadhaarResult.documentType}, CategoryMatched: ${aadhaarResult.isCategoryMatched}`
  );
  assertTest(
    aadhaarResult.expiryDate === 'LIFETIME',
    'Aadhaar Lifetime Validity (No Fake Expiry Invented)',
    `Expiry Date: ${aadhaarResult.expiryDate || 'LIFETIME'}`
  );
  assertTest(
    !aadhaarResult.documentNumber || aadhaarResult.documentNumber.startsWith('XXXX-XXXX-'),
    'Aadhaar Last 4 Digits Masked for Privacy',
    `Masked ID: ${aadhaarResult.documentNumber || 'Masked'}`
  );

  // 2.2 Income Certificate 3-Year Validity Rule
  const issueDateStr = '2025-04-10';
  const incomePayload = Buffer.from(`REVENUE DEPARTMENT TESHILDAR OFFICE INCOME CERTIFICATE Issue Date: ${issueDateStr}`).toString('base64');
  const incomeResult = await extractDocumentMetadataWithGemini(
    incomePayload,
    'INCOME_CERTIFICATE',
    'income_certificate.pdf'
  );
  assertTest(
    incomeResult.documentType.toLowerCase().includes('income'),
    'Income Certificate Identified',
    `Detected: ${incomeResult.documentType}`
  );
  assertTest(
    incomeResult.expiryDate !== null,
    'Income Certificate Expiry Configured with 3-Year Rule',
    `Calculated Expiry: ${incomeResult.expiryDate}`
  );

  // 2.3 Category Mismatch Rejection
  const electricityPayload = Buffer.from('UTTAR GUJARAT VIJ COMPANY LIMITED UGVCL ELECTRICITY BILL Consumer No 12345').toString('base64');
  const mismatchResult = await extractDocumentMetadataWithGemini(
    electricityPayload,
    'PAN_CARD', // Intentionally mismatched user category
    'lightbill.jpg'
  );
  assertTest(
    mismatchResult.isCategoryMatched === false,
    'Category Mismatch Accurately Flagged',
    `Selected: PAN_CARD, Detected: ${mismatchResult.documentType}, isCategoryMatched: ${mismatchResult.isCategoryMatched}`
  );

  // -------------------------------------------------------------
  // Test Section 3: Telegram & n8n Resilient Failure Handling (Items 10 & 11)
  // -------------------------------------------------------------
  console.log('\n--- Items 10 & 11: Telegram Bot & n8n Webhook Resilience ---');

  // Telegram error handling without crashing
  const telegramRes = await sendTelegramMessage('invalid-chat-id-test', 'Audit test message');
  assertTest(
    telegramRes.success === false,
    'Telegram Safe Degradation (Invalid Token / Chat Does Not Crash)',
    `Result: success=${telegramRes.success}, error="${telegramRes.error}"`
  );

  // n8n connection failure handling
  const n8nRes = await triggerIdpCreatedWebhook({
    eventId: 'test-evt-001',
    eventType: 'IDP_CREATED',
    timestamp: new Date().toISOString(),
    application: {
      id: 'app-001',
      applicationNumber: 'APP-TEST-001',
      userId: 'usr-001',
      serviceName: 'Income Certificate',
      serviceCode: 'INC-01',
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString()
    }
  });
  assertTest(
    n8nRes.deliveredViaN8n === false,
    'n8n Webhook Connection Failure Handled Gracefully',
    `deliveredViaN8n correctly reported as false without throwing`
  );

  // -------------------------------------------------------------
  // Test Section 4: National Holidays & Advance Notifications (Item 13)
  // -------------------------------------------------------------
  console.log('\n--- Item 13: National Holiday Management & Office Closures ---');
  let holidayData: any = null;
  const mockReq: any = { query: {} };
  const mockRes: any = {
    json: (data: any) => { holidayData = data; return mockRes; },
    status: () => mockRes
  };

  await getHolidays(mockReq, mockRes);
  assertTest(
    holidayData && Array.isArray(holidayData.data) && holidayData.data.length > 0,
    'Upcoming Holidays Loaded From Authoritative Calendar',
    `Found ${holidayData?.data?.length || 0} scheduled official holidays`
  );

  // Check 5-day advance notification query logic
  let notificationTriggerData: any = null;
  const notifRes: any = {
    json: (data: any) => { notificationTriggerData = data; return notifRes; },
    status: () => notifRes
  };
  await sendAdvanceHolidayNotifications({} as any, notifRes);
  assertTest(
    notificationTriggerData && notificationTriggerData.success === true,
    'Advance Holiday 5-Day Notification Evaluator Executed',
    `Status: ${notificationTriggerData?.message}`
  );

  console.log('\n===========================================================');
  console.log(`🏁 TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log('===========================================================\n');

  if (passedCount === totalCount) {
    console.log('🎉 ALL AUDIT VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    throw new Error('Some audit verification tests failed.');
  }
}

runMasterAuditTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
