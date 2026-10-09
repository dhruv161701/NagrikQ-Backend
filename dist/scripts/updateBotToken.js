"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function updateToken() {
    const newToken = process.argv[2];
    if (!newToken) {
        console.log('Usage: npm run update-token <NEW_TELEGRAM_BOT_TOKEN>');
        return;
    }
    // 1. Update backend/.env
    const envPath = path_1.default.join(__dirname, '../../.env');
    if (fs_1.default.existsSync(envPath)) {
        let envContent = fs_1.default.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/TELEGRAM_BOT_TOKEN=.*/g, `TELEGRAM_BOT_TOKEN=${newToken}`);
        fs_1.default.writeFileSync(envPath, envContent, 'utf8');
        console.log('✅ Updated TELEGRAM_BOT_TOKEN in backend/.env');
    }
    // 2. Update n8n workflow file
    const workflowPath = path_1.default.join(__dirname, '../../../n8n/workflows/nagrikq_idp_notification.json');
    if (fs_1.default.existsSync(workflowPath)) {
        let workflowContent = fs_1.default.readFileSync(workflowPath, 'utf8');
        workflowContent = workflowContent.replace(/bot\d+:[A-Za-z0-9_-]+/g, `bot${newToken}`);
        fs_1.default.writeFileSync(workflowPath, workflowContent, 'utf8');
        console.log('✅ Updated Telegram token in n8n/workflows/nagrikq_idp_notification.json');
    }
    console.log('\n🎉 Token updated successfully! Please restart the backend server (`npm run dev`).');
}
updateToken();
