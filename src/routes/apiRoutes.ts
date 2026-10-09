import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getServices,
  getServiceById,
  getOffices,
  getLocationAwareServices,
  updateServiceSlots,
  stopBookingToday,
  resumeBookingToday,
  getAvailableSlotsForService,
} from '../controllers/serviceController';
import {
  getHolidays,
  checkClosure,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  sendAdvanceHolidayNotifications,
} from '../controllers/holidayController';
import {
  createApplication,
  getApplications,
  updateApplicationStatus,
  updateDocumentStatus,
} from '../controllers/applicationController';
import {
  generateToken,
  getMyTokens,
  getLiveQueue,
  getOfficerQueueTokens,
  callNextToken,
  updateTokenStatus,
  routeNextTable,
  cancelToken,
  advanceCounter,
  rebookToken,
} from '../controllers/queueController';
import {
  createChangeRequest,
  getChangeRequests,
  getAuditLogs,
  createEmployeeUser,
  getEmployeesList,
  updateEmployeeUser,
  deleteEmployeeUser,
  setupOfficeConfig,
} from '../controllers/adminController';
import {
  reviewChangeRequest,
  getSystemAnalytics,
  createAdminUser,
  getAdminsList,
  updateAdminUser,
  deleteAdminUser,
  createGlobalService,
  updateGlobalService,
  deleteGlobalService,
  toggleGlobalServiceStatus,
} from '../controllers/superAdminController';
import {
  submitComplaint,
  getComplaints,
} from '../controllers/complaintController';
import {
  getProfile,
  updateProfile,
} from '../controllers/profileController';
import {
  uploadToCloudinary,
  downloadFromCloudinary,
  deleteFromCloudinary,
  verifyAndUploadDocument,
  getUserDocuments,
  saveUserDocument,
  deleteUserDocument,
} from '../controllers/uploadController';
import { askRagQuestion } from '../controllers/aiController';
import {
  handleTelegramWebhook,
  linkTelegramAccount,
  sendIdpNotification,
  getTelegramMappings,
  getTelegramStatus,
} from '../controllers/telegramController';
import {
  registerFcmToken,
  sendPushNotification,
  getUserNotifications,
} from '../controllers/notificationController';

const router = Router();

// PUBLIC ROUTES
router.get('/services', getServices);
router.get('/services/location-aware', getLocationAwareServices);
router.get('/services/:id/available-slots', getAvailableSlotsForService);
router.get('/services/:id', getServiceById);
router.get('/offices', getOffices);

// HOLIDAY & OFFICE CLOSURE ROUTES (Requirement 13)
router.get('/holidays', getHolidays);
router.get('/holidays/check-closure', checkClosure);
router.post('/holidays/advance-notifications', sendAdvanceHolidayNotifications);
router.post('/holidays', authenticateToken, requireRole('admin', 'superadmin'), createHoliday);
router.put('/holidays/:id', authenticateToken, requireRole('admin', 'superadmin'), updateHoliday);
router.delete('/holidays/:id', authenticateToken, requireRole('admin', 'superadmin'), deleteHoliday);

// TELEGRAM BOT ROUTES
router.post('/telegram/webhook', handleTelegramWebhook);
router.get('/telegram/status', getTelegramStatus);
router.post('/telegram/notify-idp', sendIdpNotification);
router.post('/telegram/link', authenticateToken, linkTelegramAccount);
router.get('/telegram/mappings', authenticateToken, requireRole('admin', 'superadmin'), getTelegramMappings);

// AUTHENTICATED PROFILE ROUTES
router.get('/profile', authenticateToken, getProfile);
router.post('/profile/onboarding', authenticateToken, updateProfile);
router.put('/profile', authenticateToken, updateProfile);

// AUTHENTICATED APPLICATION & QUEUE ROUTES
router.post('/applications', authenticateToken, createApplication);
router.get('/applications', authenticateToken, getApplications);
router.patch('/applications/:id/status', authenticateToken, requireRole('employee', 'admin', 'superadmin'), updateApplicationStatus);
router.patch('/applications/documents/:docId/status', authenticateToken, requireRole('employee', 'admin', 'superadmin'), updateDocumentStatus);

router.post('/queue/token', authenticateToken, generateToken);
router.get('/queue/live', authenticateToken, getLiveQueue);
router.get('/queue/my-tokens', authenticateToken, getMyTokens);
router.get('/queue/tokens', authenticateToken, requireRole('employee', 'admin', 'superadmin'), getOfficerQueueTokens);
router.post('/queue/next', authenticateToken, requireRole('employee', 'admin', 'superadmin'), callNextToken);
router.patch('/queue/tokens/:id/status', authenticateToken, requireRole('employee', 'admin', 'superadmin'), updateTokenStatus);
router.post('/queue/tokens/:id/next-table', authenticateToken, requireRole('employee', 'admin', 'superadmin'), routeNextTable);
router.patch('/queue/tokens/:id/cancel', authenticateToken, cancelToken);
router.delete('/queue/tokens/:id', authenticateToken, cancelToken);
router.post('/queue/tokens/:id/advance-counter', authenticateToken, requireRole('employee', 'admin', 'superadmin'), advanceCounter);
router.post('/queue/tokens/:id/rebook', authenticateToken, rebookToken);

router.post('/complaints', authenticateToken, submitComplaint);
router.get('/complaints', authenticateToken, getComplaints);

// REALTIME PUSH NOTIFICATIONS & FCM TOKEN ROUTES
router.post('/notifications/fcm-token', registerFcmToken);
router.post('/notifications/send-push', sendPushNotification);
router.get('/notifications', authenticateToken, getUserNotifications);

// RAG AI ASSISTANT ROUTES (public - read-only query)
router.post('/rag/ask', askRagQuestion);

// CLOUDINARY UPLOAD & FILE ROUTES
router.post('/upload/cloudinary', uploadToCloudinary);
router.post('/upload/verify-and-upload', verifyAndUploadDocument);
router.post('/upload/verify-document', verifyAndUploadDocument);
router.get('/upload/cloudinary/download', downloadFromCloudinary);
router.post('/upload/cloudinary/download', downloadFromCloudinary);
router.post('/upload/cloudinary/delete', deleteFromCloudinary);

// DOCUMENT VAULT ROUTES (Fix 5, Fix 17)
router.get('/documents', authenticateToken, getUserDocuments);
router.post('/documents', authenticateToken, saveUserDocument);
router.delete('/documents/:id', authenticateToken, deleteUserDocument);

// SERVICE BOOKING CONTROL (Requirement 21, 24)
router.patch('/services/:id/slots', authenticateToken, requireRole('admin', 'superadmin'), updateServiceSlots);
router.post('/services/:id/stop-booking', authenticateToken, requireRole('employee', 'admin', 'superadmin'), stopBookingToday);
router.post('/services/:id/resume-booking', authenticateToken, requireRole('employee', 'admin', 'superadmin'), resumeBookingToday);

// ADMIN ROUTES
router.post('/admin/employees', authenticateToken, requireRole('admin', 'superadmin'), createEmployeeUser);
router.get('/admin/employees', authenticateToken, requireRole('admin', 'superadmin'), getEmployeesList);
router.patch('/admin/employees/:id', authenticateToken, requireRole('admin', 'superadmin'), updateEmployeeUser);
router.delete('/admin/employees/:id', authenticateToken, requireRole('admin', 'superadmin'), deleteEmployeeUser);
router.post('/admin/office/setup', authenticateToken, requireRole('admin', 'superadmin'), setupOfficeConfig);
router.post('/change-requests', authenticateToken, requireRole('admin', 'superadmin'), createChangeRequest);
router.get('/change-requests', authenticateToken, requireRole('admin', 'superadmin'), getChangeRequests);
router.get('/audit-logs', authenticateToken, requireRole('admin', 'superadmin'), getAuditLogs);

// SUPER ADMIN ROUTES
router.post('/super-admin/create-admin', authenticateToken, requireRole('superadmin'), createAdminUser);
router.get('/super-admin/admins', authenticateToken, requireRole('superadmin'), getAdminsList);
router.patch('/super-admin/admins/:id', authenticateToken, requireRole('superadmin'), updateAdminUser);
router.delete('/super-admin/admins/:id', authenticateToken, requireRole('superadmin'), deleteAdminUser);
router.post('/super-admin/services', authenticateToken, requireRole('superadmin'), createGlobalService);
router.put('/super-admin/services/:id', authenticateToken, requireRole('superadmin'), updateGlobalService);
router.delete('/super-admin/services/:id', authenticateToken, requireRole('superadmin'), deleteGlobalService);
router.patch('/super-admin/services/:id/status', authenticateToken, requireRole('superadmin'), toggleGlobalServiceStatus);
router.patch('/change-requests/:id/review', authenticateToken, requireRole('superadmin'), reviewChangeRequest);
router.get('/analytics/system', authenticateToken, requireRole('superadmin'), getSystemAnalytics);

export default router;
