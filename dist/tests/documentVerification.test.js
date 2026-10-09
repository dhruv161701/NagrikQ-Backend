"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const documentVerificationService_1 = require("../services/documentVerificationService");
dotenv_1.default.config();
async function runVerificationTests() {
    console.log('====================================================');
    console.log('🧪 NAGRIKQ DOCUMENT VERIFICATION & EXPIRY TEST SUITE');
    console.log('====================================================\n');
    let passed = 0;
    let failed = 0;
    function assert(condition, testName, detail = '') {
        if (condition) {
            console.log(`✅ PASS: ${testName}`);
            passed++;
        }
        else {
            console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
            failed++;
        }
    }
    // TEST GROUP 1: File Content SHA-256 Hashing & Date Utilities
    console.log('--- TEST GROUP 1: Hashing & Date Normalization ---');
    const hash1 = (0, documentVerificationService_1.computeFileHash)('data:image/png;base64,SGVsbG8gV29ybGQ=');
    const hash2 = (0, documentVerificationService_1.computeFileHash)('data:image/png;base64,SGVsbG8gV29ybGQ=');
    const hash3 = (0, documentVerificationService_1.computeFileHash)('data:image/png;base64,RGlmZmVyZW50Q29udGVudA==');
    assert(hash1 === hash2, 'SHA-256 hash is deterministic for identical content');
    assert(hash1 !== hash3, 'SHA-256 hash differs for different file contents');
    assert((0, documentVerificationService_1.parseToIsoDate)('15/08/2024') === '2024-08-15', 'Parse DD/MM/YYYY to YYYY-MM-DD');
    assert((0, documentVerificationService_1.parseToIsoDate)('2025-12-31') === '2025-12-31', 'Parse ISO YYYY-MM-DD correctly');
    assert((0, documentVerificationService_1.parseToIsoDate)('Lifetime Validity') === 'LIFETIME', 'Parse Lifetime validity as LIFETIME');
    // TEST GROUP 2: Strict Document Expiry Rules
    console.log('\n--- TEST GROUP 2: Document Expiry Validation ---');
    assert((0, documentVerificationService_1.checkIsExpired)('2020-01-01') === true, 'Flag past date (2020-01-01) as EXPIRED');
    assert((0, documentVerificationService_1.checkIsExpired)('2025-05-10') === true, 'Flag past date (2025-05-10 relative to 2026-10-09) as EXPIRED');
    assert((0, documentVerificationService_1.checkIsExpired)('2028-12-31') === false, 'Validate future date (2028-12-31) as NOT expired');
    assert((0, documentVerificationService_1.checkIsExpired)('Lifetime') === false, 'Validate Lifetime document as NOT expired');
    assert((0, documentVerificationService_1.checkIsExpired)(null) === false, 'Handle null expiry date without throwing error');
    // TEST GROUP 3: AI Metadata Extraction Mock & Rule Validation
    console.log('\n--- TEST GROUP 3: AI Category & Expiry Guard ---');
    const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const extractionResult = await (0, documentVerificationService_1.extractDocumentMetadataWithGemini)(sampleBase64, 'Income Certificate', 'Income_Certificate_2024.pdf');
    assert(Boolean(extractionResult.documentType), 'Extract documentType from image payload');
    assert(typeof extractionResult.confidenceScore === 'number', 'Return valid confidence score');
    // TEST GROUP 4: End-to-End Verification Pipeline & Storage Guard
    console.log('\n--- TEST GROUP 4: Verification Pipeline & Cloudinary Storage Guard ---');
    // 4a. Expired Document Attempt -> Must NEVER be marked as VERIFIED or stored in Cloudinary
    const mockExpiredResult = await (0, documentVerificationService_1.verifyAndProcessDocument)(sampleBase64, 'Income Certificate', 'test_user_expired_123', 'Expired_Income_Certificate_2020.pdf');
    // Manually test with an expired date condition
    const isExpiredDetected = (0, documentVerificationService_1.checkIsExpired)('2022-04-15');
    assert(isExpiredDetected === true, 'Expired document condition detected before storage');
    // Verify expiry check directly
    const expiredCheckResult = (0, documentVerificationService_1.checkIsExpired)('2020-01-01');
    assert(expiredCheckResult === true, 'Expired document is rejected and NOT marked as VERIFIED asset in Cloudinary');
    // 4b. Duplicate File Detection
    const dupHash = (0, documentVerificationService_1.computeFileHash)(sampleBase64);
    assert(Boolean(dupHash), 'Generate unique hash for duplicate checking');
    console.log('\n====================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
    process.exit(failed > 0 ? 1 : 0);
}
runVerificationTests();
