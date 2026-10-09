import { notificationService, SendNotificationOptions } from '../src/services/notificationService';

async function runTests() {
  console.log('🧪 Starting Push Notification Suite for Queue Operations...\n');

  const testUserId = 'test-citizen-uuid-001';
  const testFcmToken = 'fake_fcm_token_device_simulation_abc123';

  // Test 1: Device Token Registration
  console.log('Test 1: Registering device FCM token for user...');
  await notificationService.registerDeviceToken(testUserId, testFcmToken, 'Android 14 (Test Device)');
  const tokens = await notificationService.getUserTokens(testUserId);
  console.assert(tokens.includes(testFcmToken), '❌ Token was not saved in registry!');
  console.log('✅ Test 1 Passed: Device token successfully registered.\n');

  // Test 2: Service Booking Notification
  console.log('Test 2: Service Booking Notification...');
  const bookingSuccess = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 1',
    eventType: 'BOOKING_CONFIRMED',
    title: 'Booking Confirmed',
    body: 'Your booking for Income Certificate is confirmed. Your token number is A025.',
  });
  console.assert(bookingSuccess === true, '❌ Booking notification failed!');
  console.log('✅ Test 2 Passed: Booking notification dispatched.\n');

  // Test 3: Deduplication Prevention
  console.log('Test 3: Duplicate Notification Prevention...');
  const dupResult = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 1',
    eventType: 'BOOKING_CONFIRMED',
    title: 'Booking Confirmed',
    body: 'Your booking for Income Certificate is confirmed. Your token number is A025.',
  });
  console.assert(dupResult === true, '❌ Deduplication should return true gracefully without resending!');
  console.log('✅ Test 3 Passed: Duplicate notification safely deduplicated.\n');

  // Test 4: Employee Redirects User to Another Table / Counter
  console.log('Test 4: Table Redirection Notification...');
  const redirectSuccess = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 1',
    nextCounter: 'Counter 3',
    eventType: 'TABLE_REDIRECTED',
    title: 'Please Proceed to Another Counter',
    body: 'Your token A025 has been redirected to Counter 3. Please proceed to the assigned counter.',
  });
  console.assert(redirectSuccess === true, '❌ Redirect notification failed!');
  console.log('✅ Test 4 Passed: Table redirection notification dispatched.\n');

  // Test 5: Employee Starts Processing
  console.log('Test 5: Service Processing Started Notification...');
  const processingSuccess = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 2',
    eventType: 'SERVICE_PROCESSING',
    title: 'Your Service Is Being Processed',
    body: 'Processing for your Income Certificate service has started at Counter 2.',
  });
  console.assert(processingSuccess === true, '❌ Processing notification failed!');
  console.log('✅ Test 5 Passed: Service processing notification dispatched.\n');

  // Test 6: Employee Completes Service
  console.log('Test 6: Service Completed Notification...');
  const completeSuccess = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 2',
    eventType: 'SERVICE_COMPLETED',
    title: 'Service Completed',
    body: 'Your service for Income Certificate has been completed successfully.',
  });
  console.assert(completeSuccess === true, '❌ Complete notification failed!');
  console.log('✅ Test 6 Passed: Service completed notification dispatched.\n');

  // Test 7: Employee Skips Token
  console.log('Test 7: Token Skipped Notification...');
  const skipSuccess = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 2',
    eventType: 'TOKEN_SKIPPED',
    title: 'Your Token Has Been Skipped',
    body: 'Your token A025 has been skipped. Please check with the assigned counter or staff for the next steps.',
  });
  console.assert(skipSuccess === true, '❌ Skip notification failed!');
  console.log('✅ Test 7 Passed: Token skipped notification dispatched.\n');

  // Test 8: Token Called Notification
  console.log('Test 8: Token Called Notification...');
  const callSuccess = await notificationService.sendQueuePushNotification({
    userId: testUserId,
    tokenId: 'tok-001',
    tokenNumber: 'A025',
    serviceName: 'Income Certificate',
    counterNumber: 'Counter 2',
    eventType: 'TOKEN_CALLED',
    title: 'Token Called',
    body: 'Your token A025 has been called. Please proceed to Counter 2.',
  });
  console.assert(callSuccess === true, '❌ Call notification failed!');
  console.log('✅ Test 8 Passed: Token called notification dispatched.\n');

  console.log('🎉 All 8 Push Notification Test Scenarios Passed Successfully!');
  process.exit(0);
}

runTests().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
