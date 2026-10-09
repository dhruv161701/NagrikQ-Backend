"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserDocument = exports.saveUserDocument = exports.getUserDocuments = exports.verifyAndUploadDocument = exports.deleteFromCloudinary = exports.downloadFromCloudinary = exports.uploadToCloudinary = void 0;
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dx3tt1c5v';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '452682556522892';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'xt4gUzLhHuCkHe1WfIziebRdxZg';
const uploadToCloudinary = async (req, res) => {
    try {
        const { fileData, fileName, userId: reqUserId, folder: customFolder } = req.body;
        if (!fileData) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_INPUT', message: 'fileData is required.' },
            });
            return;
        }
        // Determine target user folder in Cloudinary
        const targetUserId = req.user?.id || reqUserId || 'user_general';
        // Sanitise folder name to avoid invalid characters
        const cleanUserId = String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const folder = customFolder || `nagrikq/users/${cleanUserId}`;
        const timestamp = Math.floor(Date.now() / 1000);
        // Compute Cloudinary signature: parameters must be in alphabetical order
        const strToSign = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
        const signature = crypto_1.default.createHash('sha1').update(strToSign).digest('hex');
        // Prepare multipart form data for Cloudinary API
        const formData = new FormData();
        formData.append('file', fileData);
        formData.append('api_key', CLOUDINARY_API_KEY);
        formData.append('timestamp', String(timestamp));
        formData.append('folder', folder);
        formData.append('signature', signature);
        const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            const errMsg = result.error?.message || 'Failed to upload document to Cloudinary.';
            res.status(400).json({
                success: false,
                error: { code: 'CLOUDINARY_UPLOAD_ERROR', message: errMsg },
            });
            return;
        }
        res.json({
            success: true,
            data: {
                secureUrl: result.secure_url,
                url: result.url,
                publicId: result.public_id,
                bytes: result.bytes,
                format: result.format,
                resourceType: result.resource_type,
                folder,
                fileName: fileName || result.original_filename || 'document',
            },
        });
    }
    catch (err) {
        console.error('[Cloudinary Upload Error]', err);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message || 'Server upload failure.' },
        });
    }
};
exports.uploadToCloudinary = uploadToCloudinary;
const downloadFromCloudinary = async (req, res) => {
    try {
        const publicId = String(req.query.publicId || req.body.publicId || '');
        const rawFormat = String(req.query.format || req.body.format || 'pdf');
        const fileName = String(req.query.fileName || req.body.fileName || 'document.pdf');
        const resourceType = String(req.query.resourceType || req.body.resourceType || 'image');
        if (!publicId) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_INPUT', message: 'publicId is required for download.' },
            });
            return;
        }
        const format = rawFormat.toLowerCase().replace(/^\./, '');
        const timestamp = Math.floor(Date.now() / 1000);
        // Compute signature for private download
        const strToSign = `format=${format}&public_id=${publicId}&timestamp=${timestamp}&type=upload${CLOUDINARY_API_SECRET}`;
        const signature = crypto_1.default.createHash('sha1').update(strToSign).digest('hex');
        const downloadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/download?format=${format}&public_id=${encodeURIComponent(publicId)}&timestamp=${timestamp}&type=upload&api_key=${CLOUDINARY_API_KEY}&signature=${signature}`;
        // Redirect browser to signed Cloudinary download endpoint
        res.redirect(downloadUrl);
    }
    catch (err) {
        console.error('[Cloudinary Download Error]', err);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message || 'Download streaming failure.' },
        });
    }
};
exports.downloadFromCloudinary = downloadFromCloudinary;
const deleteFromCloudinary = async (req, res) => {
    try {
        const { publicId, resourceType = 'image' } = req.body;
        if (!publicId) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_INPUT', message: 'publicId is required for deletion.' },
            });
            return;
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const strToSign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
        const signature = crypto_1.default.createHash('sha1').update(strToSign).digest('hex');
        const formData = new FormData();
        formData.append('public_id', publicId);
        formData.append('api_key', CLOUDINARY_API_KEY);
        formData.append('timestamp', String(timestamp));
        formData.append('signature', signature);
        const destroyUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`;
        const response = await fetch(destroyUrl, { method: 'POST', body: formData });
        const data = await response.json();
        res.json({
            success: true,
            data,
        });
    }
    catch (err) {
        console.error('[Cloudinary Delete Error]', err);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message || 'Failed to delete document from Cloudinary.' },
        });
    }
};
exports.deleteFromCloudinary = deleteFromCloudinary;
/**
 * Controller to verify document authenticity, expiry date, category, and duplicate status
 * using Gemini AI OCR before storing in Cloudinary as an approved asset.
 */
const verifyAndUploadDocument = async (req, res) => {
    try {
        const { fileData, fileName, documentCategory, userId: reqUserId } = req.body;
        if (!fileData) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_INPUT', message: 'fileData is required for document verification.' },
            });
            return;
        }
        // Enforce 10 MB maximum file size limit
        const cleanBase64 = String(fileData).replace(/^data:[^;]+;base64,/, '');
        const estimatedSizeBytes = Math.ceil((cleanBase64.length * 3) / 4);
        if (estimatedSizeBytes > 10 * 1024 * 1024) {
            res.status(400).json({
                success: false,
                error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds the maximum allowed limit of 10 MB.' },
            });
            return;
        }
        const userId = req.user?.id || reqUserId || 'user_general';
        const category = documentCategory || 'General Document';
        const name = fileName || 'document.pdf';
        const { verifyAndProcessDocument } = await Promise.resolve().then(() => __importStar(require('../services/documentVerificationService')));
        const result = await verifyAndProcessDocument(fileData, category, userId, name);
        if (!result.isVerified) {
            res.status(400).json({
                success: false,
                verificationStatus: result.verificationStatus,
                error: {
                    code: `VERIFICATION_${result.verificationStatus}`,
                    message: result.failureReason || 'Document verification failed. Asset was not stored.',
                },
                extractedInfo: result.extractedInfo,
                fileHash: result.fileHash,
            });
            return;
        }
        res.json({
            success: true,
            verificationStatus: result.verificationStatus,
            data: {
                secureUrl: result.cloudinaryUrl,
                publicId: result.cloudinaryPublicId,
                fileName: name,
                fileHash: result.fileHash,
                extractedInfo: result.extractedInfo,
            },
        });
    }
    catch (err) {
        console.error('[Document Verification & Upload Error]', err);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message || 'Document verification pipeline error.' },
        });
    }
};
exports.verifyAndUploadDocument = verifyAndUploadDocument;
const getUserDocuments = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const { data: docs, error } = await supabase_1.supabaseAdmin
            .from('documents')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) {
            res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
            return;
        }
        res.json({ success: true, data: docs || [] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getUserDocuments = getUserDocuments;
const saveUserDocument = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const { requirementName, fileName, storagePath, verificationStatus, notes } = req.body;
        const { data: doc, error } = await supabase_1.supabaseAdmin
            .from('documents')
            .insert({
            user_id: userId,
            requirement_name: requirementName || 'Uploaded Document',
            file_name: fileName || 'document.pdf',
            storage_path: storagePath || '#',
            verification_status: verificationStatus || 'PENDING',
            notes: notes || null,
        })
            .select('*')
            .single();
        if (error) {
            res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
            return;
        }
        res.status(201).json({ success: true, data: doc });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.saveUserDocument = saveUserDocument;
const deleteUserDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { data: doc } = await supabase_1.supabaseAdmin
            .from('documents')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (!doc) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
            return;
        }
        if (req.user?.role === 'citizen' && doc.user_id !== userId) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized to delete this document' } });
            return;
        }
        await supabase_1.supabaseAdmin.from('documents').delete().eq('id', id);
        res.json({ success: true, message: 'Document deleted successfully from vault.' });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.deleteUserDocument = deleteUserDocument;
