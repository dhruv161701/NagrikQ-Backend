import fs from 'fs';
import path from 'path';

function updateToken() {
  const newToken = process.argv[2];
  if (!newToken) {
    console.log('Usage: npm run update-token <NEW_TELEGRAM_BOT_TOKEN>');
    return;
  }

  // 1. Update backend/.env
  const envPath = path.join(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/TELEGRAM_BOT_TOKEN=.*/g, `TELEGRAM_BOT_TOKEN=${newToken}`);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Updated TELEGRAM_BOT_TOKEN in backend/.env');
  }

  // 2. Update n8n workflow file
  const workflowPath = path.join(__dirname, '../../../n8n/workflows/nagrikq_idp_notification.json');
  if (fs.existsSync(workflowPath)) {
    let workflowContent = fs.readFileSync(workflowPath, 'utf8');
    workflowContent = workflowContent.replace(/bot\d+:[A-Za-z0-9_-]+/g, `bot${newToken}`);
    fs.writeFileSync(workflowPath, workflowContent, 'utf8');
    console.log('✅ Updated Telegram token in n8n/workflows/nagrikq_idp_notification.json');
  }

  console.log('\n🎉 Token updated successfully! Please restart the backend server (`npm run dev`).');
}

updateToken();
