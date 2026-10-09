"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const n8nService_1 = require("../services/n8nService");
async function testWebhook() {
    const args = process.argv.slice(2);
    const phone = args[0] || '9876543210';
    const eventId = `evt_test_${Date.now()}`;
    console.log(`Triggering n8n IDP Webhook for phone: ${phone}, eventId: ${eventId}...`);
    const result = await (0, n8nService_1.triggerIdpCreatedWebhook)({
        eventId,
        eventType: 'IDP_CREATED',
        timestamp: new Date().toISOString(),
        application: {
            id: '01a51298-36e4-4567-ad3b-0f92f43bdd1b',
            applicationNumber: 'APP-IDP-2026-99',
            userId: '01a51298-36e4-4567-ad3b-0f92f43bdd1b',
            serviceName: 'International Driving Permit (IDP)',
            serviceCode: 'SRV-IDP-001',
            status: 'APPROVED',
            phone: phone,
            submittedAt: new Date().toISOString(),
        },
    });
    console.log('Webhook Result:', result);
}
testWebhook();
