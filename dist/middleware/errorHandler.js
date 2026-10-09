"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, req, res, next) => {
    console.error('[NagrikQ API Error]:', err);
    const response = {
        success: false,
        error: {
            code: err.code || 'INTERNAL_SERVER_ERROR',
            message: err.message || 'An unexpected server error occurred.',
        },
    };
    res.status(err.status || 500).json(response);
};
exports.errorHandler = errorHandler;
