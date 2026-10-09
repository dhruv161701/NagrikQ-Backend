"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const serviceController_1 = require("../controllers/serviceController");
const holidayController_1 = require("../controllers/holidayController");
const applicationController_1 = require("../controllers/applicationController");
const queueController_1 = require("../controllers/queueController");
const adminController_1 = require("../controllers/adminController");
const superAdminController_1 = require("../controllers/superAdminController");
const complaintController_1 = require("../controllers/complaintController");
const profileController_1 = require("../controllers/profileController");
const uploadController_1 = require("../controllers/uploadController");
const aiController_1 = require("../controllers/aiController");
const telegramController_1 = require("../controllers/telegramController");
const notificationController_1 = require("../controllers/notificationController");
const router = (0, express_1.Router)();
// PUBLIC ROUTES
router.get('/services', serviceController_1.getServices);
router.get('/services/location-aware', serviceController_1.getLocationAwareServices);
router.get('/services/:id/available-slots', serviceController_1.getAvailableSlotsForService);
router.get('/services/:id', serviceController_1.getServiceById);
router.get('/offices', serviceController_1.getOffices);
// HOLIDAY & OFFICE CLOSURE ROUTES (Requirement 13)
router.get('/holidays', holidayController_1.getHolidays);
router.get('/holidays/check-closure', holidayController_1.checkClosure);
router.post('/holidays/advance-notifications', holidayController_1.sendAdvanceHolidayNotifications);
router.post('/holidays', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), holidayController_1.createHoliday);
router.put('/holidays/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), holidayController_1.updateHoliday);
router.delete('/holidays/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), holidayController_1.deleteHoliday);
// TELEGRAM BOT ROUTES
router.post('/telegram/webhook', telegramController_1.handleTelegramWebhook);
router.get('/telegram/status', telegramController_1.getTelegramStatus);
router.post('/telegram/notify-idp', telegramController_1.sendIdpNotification);
router.post('/telegram/link', auth_1.authenticateToken, telegramController_1.linkTelegramAccount);
router.get('/telegram/mappings', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), telegramController_1.getTelegramMappings);
// AUTHENTICATED PROFILE ROUTES
router.get('/profile', auth_1.authenticateToken, profileController_1.getProfile);
router.post('/profile/onboarding', auth_1.authenticateToken, profileController_1.updateProfile);
router.put('/profile', auth_1.authenticateToken, profileController_1.updateProfile);
// AUTHENTICATED APPLICATION & QUEUE ROUTES
router.post('/applications', auth_1.authenticateToken, applicationController_1.createApplication);
router.get('/applications', auth_1.authenticateToken, applicationController_1.getApplications);
router.patch('/applications/:id/status', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), applicationController_1.updateApplicationStatus);
router.patch('/applications/documents/:docId/status', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), applicationController_1.updateDocumentStatus);
router.post('/queue/token', auth_1.authenticateToken, queueController_1.generateToken);
router.get('/queue/live', auth_1.authenticateToken, queueController_1.getLiveQueue);
router.get('/queue/my-tokens', auth_1.authenticateToken, queueController_1.getMyTokens);
router.get('/queue/tokens', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), queueController_1.getOfficerQueueTokens);
router.post('/queue/next', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), queueController_1.callNextToken);
router.patch('/queue/tokens/:id/status', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), queueController_1.updateTokenStatus);
router.post('/queue/tokens/:id/next-table', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), queueController_1.routeNextTable);
router.patch('/queue/tokens/:id/cancel', auth_1.authenticateToken, queueController_1.cancelToken);
router.delete('/queue/tokens/:id', auth_1.authenticateToken, queueController_1.cancelToken);
router.post('/queue/tokens/:id/advance-counter', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), queueController_1.advanceCounter);
router.post('/queue/tokens/:id/rebook', auth_1.authenticateToken, queueController_1.rebookToken);
router.post('/complaints', auth_1.authenticateToken, complaintController_1.submitComplaint);
router.get('/complaints', auth_1.authenticateToken, complaintController_1.getComplaints);
// REALTIME PUSH NOTIFICATIONS & FCM TOKEN ROUTES
router.post('/notifications/fcm-token', notificationController_1.registerFcmToken);
router.post('/notifications/send-push', notificationController_1.sendPushNotification);
router.get('/notifications', auth_1.authenticateToken, notificationController_1.getUserNotifications);
// RAG AI ASSISTANT ROUTES (public - read-only query)
router.post('/rag/ask', aiController_1.askRagQuestion);
// CLOUDINARY UPLOAD & FILE ROUTES
router.post('/upload/cloudinary', uploadController_1.uploadToCloudinary);
router.post('/upload/verify-and-upload', uploadController_1.verifyAndUploadDocument);
router.post('/upload/verify-document', uploadController_1.verifyAndUploadDocument);
router.get('/upload/cloudinary/download', uploadController_1.downloadFromCloudinary);
router.post('/upload/cloudinary/download', uploadController_1.downloadFromCloudinary);
router.post('/upload/cloudinary/delete', uploadController_1.deleteFromCloudinary);
// DOCUMENT VAULT ROUTES (Fix 5, Fix 17)
router.get('/documents', auth_1.authenticateToken, uploadController_1.getUserDocuments);
router.post('/documents', auth_1.authenticateToken, uploadController_1.saveUserDocument);
router.delete('/documents/:id', auth_1.authenticateToken, uploadController_1.deleteUserDocument);
// SERVICE BOOKING CONTROL (Requirement 21, 24)
router.patch('/services/:id/slots', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), serviceController_1.updateServiceSlots);
router.post('/services/:id/stop-booking', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), serviceController_1.stopBookingToday);
router.post('/services/:id/resume-booking', auth_1.authenticateToken, (0, rbac_1.requireRole)('employee', 'admin', 'superadmin'), serviceController_1.resumeBookingToday);
// ADMIN ROUTES
router.post('/admin/employees', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.createEmployeeUser);
router.get('/admin/employees', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.getEmployeesList);
router.patch('/admin/employees/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.updateEmployeeUser);
router.delete('/admin/employees/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.deleteEmployeeUser);
router.post('/admin/office/setup', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.setupOfficeConfig);
router.post('/change-requests', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.createChangeRequest);
router.get('/change-requests', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.getChangeRequests);
router.get('/audit-logs', auth_1.authenticateToken, (0, rbac_1.requireRole)('admin', 'superadmin'), adminController_1.getAuditLogs);
// SUPER ADMIN ROUTES
router.post('/super-admin/create-admin', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.createAdminUser);
router.get('/super-admin/admins', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.getAdminsList);
router.patch('/super-admin/admins/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.updateAdminUser);
router.delete('/super-admin/admins/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.deleteAdminUser);
router.post('/super-admin/services', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.createGlobalService);
router.put('/super-admin/services/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.updateGlobalService);
router.delete('/super-admin/services/:id', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.deleteGlobalService);
router.patch('/super-admin/services/:id/status', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.toggleGlobalServiceStatus);
router.patch('/change-requests/:id/review', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.reviewChangeRequest);
router.get('/analytics/system', auth_1.authenticateToken, (0, rbac_1.requireRole)('superadmin'), superAdminController_1.getSystemAnalytics);
exports.default = router;
