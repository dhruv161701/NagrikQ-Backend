"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../config/supabase");
async function main() {
    console.log('Testing connection to Supabase...');
    const { data: staff, error: staffErr } = await supabase_1.supabaseAdmin.from('staff_profiles').select('*').limit(1);
    console.log('staff_profiles error:', staffErr);
    if (staff && staff.length > 0) {
        console.log('staff_profiles columns:', Object.keys(staff[0]));
        console.log('staff sample:', staff[0]);
    }
    else {
        console.log('staff_profiles table empty or no rows.');
    }
    const { data: counters, error: countErr } = await supabase_1.supabaseAdmin.from('counters').select('*').limit(1);
    console.log('counters error:', countErr);
    if (counters && counters.length > 0) {
        console.log('counters columns:', Object.keys(counters[0]));
    }
    const { data: officers, error: offErr } = await supabase_1.supabaseAdmin.from('officers').select('*').limit(1);
    console.log('officers error:', offErr);
    if (officers && officers.length > 0) {
        console.log('officers columns:', Object.keys(officers[0]));
    }
    const { data: apps, error: appErr } = await supabase_1.supabaseAdmin
        .from('applications')
        .select('*, services(id, name, code, category), offices(id, name), profiles:user_id(id, full_name, email, phone), documents(*)')
        .order('submitted_at', { ascending: false });
    console.log('applications count with joins:', apps?.length);
    if (apps) {
        apps.forEach(a => console.log('App with join:', a.id, a.application_number, 'docs count:', a.documents?.length));
        const ids = apps.map(a => a.id);
        const setIds = new Set(ids);
        console.log('Duplicate IDs in join:', ids.length !== setIds.size);
    }
    const { data: rpcList, error: rpcListErr } = await supabase_1.supabaseAdmin.from('information_schema.routines').select('*').limit(5);
    console.log('routines test:', { rpcList, rpcListErr });
    const { data: appts, error: apptErr } = await supabase_1.supabaseAdmin.from('appointments').select('*').limit(1);
    console.log('appointments error:', apptErr);
    if (appts && appts.length > 0) {
        console.log('appointments columns:', Object.keys(appts[0]));
    }
}
main().catch(console.error);
