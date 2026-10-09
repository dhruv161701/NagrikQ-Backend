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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureKnowledgeBaseSeeded = exports.ensureSuperAdminExists = void 0;
const supabase_1 = require("../config/supabase");
const ensureSuperAdminExists = async () => {
    const superAdminEmail = 'superadmin@nagrikq.org';
    const superAdminPassword = 'SuperAdmin@123';
    try {
        console.log('[BOOTSTRAP] Checking Super Admin account status...');
        // 1. Check if user exists in Auth
        const { data: usersData, error: listError } = await supabase_1.supabaseAdmin.auth.admin.listUsers();
        let userId = null;
        if (!listError && usersData?.users) {
            const existingUser = usersData.users.find((u) => u.email === superAdminEmail);
            if (existingUser) {
                userId = existingUser.id;
                // Update password to ensure known credentials work
                await supabase_1.supabaseAdmin.auth.admin.updateUserById(userId, {
                    password: superAdminPassword,
                    email_confirm: true,
                    user_metadata: { full_name: 'State Super Administrator', role: 'superadmin' },
                });
                console.log(`[BOOTSTRAP] Super Admin Auth user found (${userId}). Credentials updated.`);
            }
        }
        // 2. If Auth user does not exist, create it via Auth Admin API
        if (!userId) {
            const { data: createData, error: createError } = await supabase_1.supabaseAdmin.auth.admin.createUser({
                email: superAdminEmail,
                password: superAdminPassword,
                email_confirm: true,
                user_metadata: {
                    full_name: 'State Super Administrator',
                    role: 'superadmin',
                },
            });
            if (createError || !createData.user) {
                console.error('[BOOTSTRAP] Failed to create Super Admin Auth user:', createError?.message);
                return;
            }
            userId = createData.user.id;
            console.log(`[BOOTSTRAP] Created new Super Admin Auth user (${userId}).`);
        }
        // 3. Upsert profiles table with role = 'superadmin'
        const { error: profileError } = await supabase_1.supabaseAdmin.from('profiles').upsert({
            id: userId,
            full_name: 'State Super Administrator',
            email: superAdminEmail,
            phone: '+91 9876543210',
            role: 'superadmin',
            state: 'Gujarat',
            district: 'Gandhinagar',
            onboarding_completed: true,
            tour_completed: true,
        }, { onConflict: 'id' });
        if (profileError) {
            console.error('[BOOTSTRAP] Profile upsert error:', profileError.message);
        }
        // 4. Upsert staff_profiles table with role = 'superadmin'
        const { error: staffError } = await supabase_1.supabaseAdmin.from('staff_profiles').upsert({
            id: userId,
            user_id: userId,
            employee_id: 'EMP-SUPERADMIN-001',
            designation: 'Chief Digital Officer / Super Admin',
            department: 'General Administration Department',
            state: 'Gujarat',
            district: 'Gandhinagar',
            role: 'superadmin',
            status: 'ACTIVE',
        }, { onConflict: 'id' });
        if (staffError) {
            console.error('[BOOTSTRAP] Staff profile upsert error:', staffError.message);
        }
        console.log('✅ [BOOTSTRAP] Super Admin system account ready:');
        console.log(`   Email: ${superAdminEmail}`);
        console.log(`   Password: ${superAdminPassword}`);
        console.log('   Role: superadmin -> Route: /super-admin/dashboard');
        // 5. Automatically seed RAG knowledge chunks if empty
        await (0, exports.ensureKnowledgeBaseSeeded)();
    }
    catch (err) {
        console.error('[BOOTSTRAP] Exception during Super Admin setup:', err.message);
    }
};
exports.ensureSuperAdminExists = ensureSuperAdminExists;
/**
 * Automatically index active services and document requirements into pgvector knowledge chunks
 */
const ensureKnowledgeBaseSeeded = async () => {
    try {
        const { count, error } = await supabase_1.supabaseAdmin
            .from('knowledge_chunks')
            .select('*', { count: 'exact', head: true });
        if (error) {
            console.warn('[BOOTSTRAP] Could not check knowledge_chunks count:', error.message);
            return;
        }
        if (count && count > 0) {
            console.log(`[BOOTSTRAP] RAG Knowledge Base already indexed (${count} chunks).`);
            return;
        }
        console.log('[BOOTSTRAP] Initializing RAG Knowledge Base indexing...');
        const { data: services } = await supabase_1.supabaseAdmin.from('services').select('*');
        if (!services || services.length === 0)
            return;
        const { data: docs } = await supabase_1.supabaseAdmin.from('document_requirements').select('*');
        const docsByService = new Map();
        (docs || []).forEach((d) => {
            const list = docsByService.get(d.service_id) || [];
            list.push(d);
            docsByService.set(d.service_id, list);
        });
        const { generateEmbedding } = await Promise.resolve().then(() => __importStar(require('./geminiService')));
        for (const srv of services) {
            const srvDocs = docsByService.get(srv.id) || [];
            const docListStr = srvDocs.length > 0
                ? srvDocs.map((d) => `• ${d.name} (${d.is_required ? 'Required' : 'Optional'}${d.description ? ': ' + d.description : ''})`).join('\n')
                : 'Standard identification documents required.';
            const chunksToInsert = [
                {
                    service_id: srv.id,
                    service_name: srv.name,
                    state: 'Gujarat',
                    department: srv.category || 'Public Administration',
                    topic: 'required_documents',
                    content: `To apply for ${srv.name} (${srv.category}), the following documents are needed:\n${docListStr}`,
                    metadata: { category: srv.category, service_id: srv.id, topic: 'required_documents' },
                },
                {
                    service_id: srv.id,
                    service_name: srv.name,
                    state: 'Gujarat',
                    department: srv.category || 'Public Administration',
                    topic: 'process_and_timeline',
                    content: `For ${srv.name}: The official processing time is approximately ${srv.processing_time_days || 7} working days. The government fee is ₹${srv.fee_amount || 0}. Description: ${srv.description || srv.name}. Citizens can book a virtual queue token online on NagrikQ to avoid office queues.`,
                    metadata: { category: srv.category, service_id: srv.id, topic: 'process_and_timeline' },
                },
            ];
            for (const ch of chunksToInsert) {
                try {
                    const emb = await generateEmbedding(ch.content);
                    if (emb && emb.length > 0) {
                        await supabase_1.supabaseAdmin.from('knowledge_chunks').insert({
                            service_id: ch.service_id,
                            service_name: ch.service_name,
                            state: ch.state,
                            department: ch.department,
                            topic: ch.topic,
                            content: ch.content,
                            embedding: emb,
                            metadata: ch.metadata,
                        });
                    }
                }
                catch (embErr) {
                    console.warn(`[BOOTSTRAP] Failed embedding for ${srv.name}:`, embErr?.message);
                }
            }
        }
        console.log('✅ [BOOTSTRAP] RAG Knowledge Base successfully populated with service embeddings.');
    }
    catch (err) {
        console.error('[BOOTSTRAP] Error seeding knowledge base:', err.message);
    }
};
exports.ensureKnowledgeBaseSeeded = ensureKnowledgeBaseSeeded;
