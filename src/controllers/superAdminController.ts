import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { supabaseAdmin } from '../config/supabase';
import { sendTelegramMessage } from '../services/telegramBotService';
import { normalizePhoneNumber } from '../utils/phoneUtils';
import { triggerIdpCreatedWebhook } from '../services/n8nService';

export const reviewChangeRequest = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reviewNote } = req.body;
    const superAdminId = req.user?.id;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Status must be APPROVED or REJECTED.' },
      });
      return;
    }

    const { data: cr, error } = await supabaseAdmin
      .from('service_change_requests')
      .update({
        status,
        reviewed_by_superadmin_id: superAdminId,
        review_note: reviewNote || `Change request ${status.toLowerCase()} by Super Admin.`,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !cr) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Change request not found.' } });
      return;
    }

    if (status === 'APPROVED' && cr.service_id && cr.added_document_name) {
      await supabaseAdmin.from('document_requirements').insert({
        service_id: cr.service_id,
        name: cr.added_document_name,
        description: `Requirement added via Change Request ${cr.request_number}`,
        is_required: true,
      });
    }

    // Log security audit log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: req.user?.role || 'superadmin',
      action: status === 'APPROVED' ? 'APPROVE_CHANGE_REQUEST' : 'REJECT_CHANGE_REQUEST',
      entity_type: 'service_change_request',
      entity_id: id,
      details: `Super Admin ${status.toLowerCase()} Change Request ${cr.request_number}. Note: ${reviewNote || 'Processed'}`,
    });

    res.json({ success: true, data: cr } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getSystemAnalytics = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { count: citizensCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'citizen');

    const { count: officesCount } = await supabaseAdmin
      .from('offices')
      .select('*', { count: 'exact', head: true });

    // Active officers count from staff_profiles or officers
    const { count: staffCount } = await supabaseAdmin
      .from('staff_profiles')
      .select('*', { count: 'exact', head: true })
      .in('role', ['employee', 'officer']);

    const { count: officersCount } = await supabaseAdmin
      .from('officers')
      .select('*', { count: 'exact', head: true });

    const finalEmployeesCount = (staffCount && staffCount > 0) ? staffCount : (officersCount || 0);

    const { count: servicesCount } = await supabaseAdmin
      .from('services')
      .select('*', { count: 'exact', head: true });

    const { count: activeServicesCount } = await supabaseAdmin
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: pendingCRsCount } = await supabaseAdmin
      .from('service_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');

    const { count: appsCount } = await supabaseAdmin
      .from('applications')
      .select('*', { count: 'exact', head: true });

    res.json({
      success: true,
      data: {
        totalCitizens: citizensCount || 0,
        activeOffices: officesCount || 0,
        activeEmployees: finalEmployeesCount,
        totalServices: servicesCount || 0,
        activeServices: activeServicesCount || 0,
        pendingChangeRequests: pendingCRsCount || 0,
        applicationsToday: appsCount || 0,
        averageWaitTimeMinutes: 0,
      },
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
export const createAdminUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const superAdminId = req.user?.id;
    const {
      fullName,
      email,
      phone,
      employeeId,
      designation,
      department,
      departmentId,
      state,
      district,
      subdivision,
      taluka,
      officeId,
      tempPassword,
    } = req.body;

    if (!fullName || !email || !employeeId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Full Name, Official Email, and Employee ID are required.' },
      });
      return;
    }

    const generatedPassword = tempPassword || `NagrikQ@${Math.floor(100000 + Math.random() * 900000)}`;

    // 1. Create Supabase Auth User securely via server-side Supabase Admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'admin',
      },
    });

    if (authError || !authData.user) {
      res.status(400).json({
        success: false,
        error: { code: 'AUTH_CREATION_FAILED', message: authError?.message || 'Failed to create admin Auth account.' },
      });
      return;
    }

    const userId = authData.user.id;

    // 2. Create profile row
    await supabaseAdmin.from('profiles').upsert(
      {
        id: userId,
        full_name: fullName,
        email,
        phone: phone || '+91 9876543210',
        role: 'admin',
        onboarding_completed: true,
        state: state || 'Gujarat',
        district: district || 'Rajkot',
      },
      { onConflict: 'id' }
    );

    // 3. Create staff_profile row
    const { data: staffProfile, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .upsert(
        {
          id: userId,
          user_id: userId,
          employee_id: employeeId,
          designation: designation || 'Department Admin',
          department: department || 'Revenue Department',
          department_id: departmentId || null,
          state: state || 'Gujarat',
          district: district || 'Rajkot',
          subdivision: subdivision || 'Rajkot',
          taluka: taluka || 'Rajkot',
          office_id: officeId || null,
          phone: phone || '+91 9876543210',
          verification_ref: generatedPassword,
          role: 'admin',
          status: 'ACTIVE',
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();

    // 4. Send Telegram credentials notification if phone number is linked
    if (phone) {
      try {
        const normPhone = normalizePhoneNumber(phone);
        const { data: mapping } = await supabaseAdmin
          .from('telegram_mappings')
          .select('telegram_chat_id')
          .eq('normalized_phone', normPhone)
          .maybeSingle();

        if (mapping?.telegram_chat_id) {
          const credMsg =
            `🎉 *NEW NAGRIKQ ADMIN ACCOUNT CREATED*\n\n` +
            `Hello *${fullName}*!\n` +
            `Your Admin account has been generated by Super Admin.\n\n` +
            `🔑 *OFFICIAL CREDENTIALS*\n` +
            `• *Login ID / Email*: \`${email}\`\n` +
            `• *Employee ID*: \`${employeeId}\`\n` +
            `• *Temporary Password*: \`${generatedPassword}\`\n\n` +
            `🔗 *Portal Login Link:*\nhttp://localhost:5173/login`;

          await sendTelegramMessage(mapping.telegram_chat_id, credMsg);
        }
      } catch (tgErr: any) {
        console.warn('[ADMIN_TELEGRAM_NOTIFY_WARN]', tgErr.message);
      }
    }

    // 5. Trigger n8n webhook for automated account creation notification
    triggerIdpCreatedWebhook({
      eventId: `evt_admin_${userId.slice(0, 8)}_${Date.now()}`,
      eventType: 'IDP_CREATED',
      timestamp: new Date().toISOString(),
      application: {
        id: userId,
        applicationNumber: employeeId,
        userId: userId,
        serviceName: 'Admin Account & Credentials Access',
        serviceCode: 'ADM-ACC-001',
        status: 'ACTIVE',
        phone: phone || '',
        submittedAt: new Date().toISOString(),
      },
    }).catch((err) => console.warn('[N8N_ADMIN_WEBHOOK_DISPATCH_WARN]', err.message));

    // 6. Log audit log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'CREATE_ADMIN_ACCOUNT',
      entity_type: 'staff_profile',
      entity_id: userId,
      details: `Super Admin created Admin account for ${fullName} (${email}) with Employee ID ${employeeId}.`,
    });

    res.status(201).json({
      success: true,
      data: {
        admin: staffProfile || { id: userId, email, fullName, employeeId, role: 'admin' },
        credentials: {
          email,
          temporaryPassword: generatedPassword,
          note: 'Provide these credentials securely to the assigned Admin officer.',
        },
      },
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getAdminsList = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // 1. Fetch staff profiles where role is admin
    const { data: staffAdmins, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('*')
      .eq('role', 'admin')
      .order('created_at', { ascending: false });

    // 2. Fetch profiles where role is admin to get names and emails
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('role', 'admin');

    const profileMap = new Map<string, any>();
    (adminProfiles || []).forEach((p) => {
      profileMap.set(p.id, p);
    });

    let resultList: any[] = [];

    if (staffAdmins && staffAdmins.length > 0) {
      resultList = staffAdmins.map((staff) => {
        const prof = profileMap.get(staff.user_id || staff.id) || profileMap.get(staff.id);
        return {
          ...staff,
          full_name: prof?.full_name || staff.full_name || 'Department Administrator',
          email: prof?.email || staff.email || '',
        };
      });
    }

    // 3. Fallback: If no staff_profiles records exist yet, render admin accounts from profiles table
    if (resultList.length === 0 && adminProfiles && adminProfiles.length > 0) {
      resultList = adminProfiles.map((p) => ({
        id: p.id,
        user_id: p.id,
        employee_id: `ADM-${p.id.slice(0, 6).toUpperCase()}`,
        designation: 'District / Office Administrator',
        department: 'Revenue Department',
        district: p.district || 'Rajkot',
        taluka: 'Rajkot',
        phone: p.phone || '+91 9876543210',
        status: 'ACTIVE',
        created_at: p.created_at || new Date().toISOString(),
        full_name: p.full_name,
        email: p.email,
        verification_ref: 'NagrikQ@Admin',
      }));
    }

    res.json({ success: true, data: resultList } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const updateAdminUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { fullName, designation, department, district, taluka, phone, status } = req.body;
    const superAdminId = req.user?.id;

    const { data: updatedStaff, error: staffErr } = await supabaseAdmin
      .from('staff_profiles')
      .update({
        designation,
        department,
        district,
        taluka,
        phone,
        status: status || 'ACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (staffErr) {
      res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: staffErr.message } });
      return;
    }

    if (fullName) {
      await supabaseAdmin
        .from('profiles')
        .update({
          full_name: fullName,
          phone,
          district,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'UPDATE_ADMIN_ACCOUNT',
      entity_type: 'staff_profile',
      entity_id: id,
      details: `Super Admin updated details for Admin account ${id}.`,
    });

    res.json({ success: true, data: updatedStaff } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const deleteAdminUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const superAdminId = req.user?.id;

    await supabaseAdmin.from('staff_profiles').delete().eq('id', id);
    await supabaseAdmin.from('profiles').delete().eq('id', id);

    try {
      await supabaseAdmin.auth.admin.deleteUser(id);
    } catch {
      // Ignore cleanup error if already removed
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'REMOVE_ADMIN_ACCOUNT',
      entity_type: 'staff_profile',
      entity_id: id,
      details: `Super Admin removed Admin account ${id}.`,
    });

    res.json({ success: true, message: 'Admin account successfully removed.' } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const createGlobalService = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const superAdminId = req.user?.id;
    const {
      name,
      code,
      category,
      description,
      processingTimeDays,
      feeAmount,
      departmentId,
      documents,
      addToAllOffices,
      selectedDistricts,
      documentOption,
      extraStateDocuments,
    } = req.body;

    if (!name || !category) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Service name and category are required.' },
      });
      return;
    }

    const serviceCode = code || `SRV-${category.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: newService, error: serviceError } = await supabaseAdmin
      .from('services')
      .insert({
        name,
        code: serviceCode,
        category,
        description: description || `Government ${name} service`,
        processing_time_days: Number(processingTimeDays) || 7,
        fee_amount: Number(feeAmount) || 0.00,
        department_id: departmentId || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (serviceError || !newService) {
      res.status(400).json({
        success: false,
        error: { code: 'SERVICE_CREATION_FAILED', message: serviceError?.message || 'Failed to create service.' },
      });
      return;
    }

    const serviceId = newService.id;

    if (Array.isArray(documents) && documents.length > 0) {
      const docRows = documents.map((doc: any) => ({
        service_id: serviceId,
        name: typeof doc === 'string' ? doc : doc.name,
        description: doc.instructions || `Required document for ${name}`,
        instructions: doc.instructions || null,
        is_required: doc.isRequired ?? true,
      }));
      await supabaseAdmin.from('document_requirements').insert(docRows);
    }

    if (documentOption === 'STATE_SPECIFIC' && Array.isArray(extraStateDocuments) && extraStateDocuments.length > 0) {
      const extraRows = extraStateDocuments.map((doc: any) => ({
        service_id: serviceId,
        name: typeof doc === 'string' ? doc : doc.name,
        description: `Jurisdiction Specific Document (${doc.state || 'State'}): ${doc.instructions || ''}`,
        instructions: doc.instructions || null,
        is_required: true,
      }));
      await supabaseAdmin.from('document_requirements').insert(extraRows);
    }

    let targetOfficesQuery = supabaseAdmin.from('offices').select('id');
    if (!addToAllOffices && Array.isArray(selectedDistricts) && selectedDistricts.length > 0) {
      const escapedList = selectedDistricts.map((item: string) => `"${item.replace(/"/g, '""')}"`).join(',');
      targetOfficesQuery = targetOfficesQuery.or(`district.in.(${escapedList}),state.in.(${escapedList})`);
    }

    const { data: targetOffices } = await targetOfficesQuery;

    if (targetOffices && targetOffices.length > 0) {
      const officeServiceRows = targetOffices.map((off) => ({
        office_id: off.id,
        service_id: serviceId,
        status: 'ACTIVE',
      }));
      await supabaseAdmin.from('office_services').upsert(officeServiceRows, { onConflict: 'office_id,service_id' });
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'CREATE_GLOBAL_SERVICE',
      entity_type: 'service',
      entity_id: serviceId,
      details: `Super Admin created global service '${name}' (${serviceCode}) assigned to ${addToAllOffices ? 'all state offices' : (selectedDistricts?.length || 0) + ' districts'}.`,
    });

    res.status(201).json({
      success: true,
      data: {
        service: newService,
        officeCount: targetOffices?.length || 0,
        message: 'Global government service successfully created and distributed across offices.',
      },
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const updateGlobalService = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const superAdminId = req.user?.id;
    const {
      name,
      code,
      category,
      description,
      processingTimeDays,
      feeAmount,
      departmentId,
      documents,
      addToAllOffices,
      selectedDistricts,
      documentOption,
      extraStateDocuments,
      isActive,
    } = req.body;

    if (!name || !category) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Service name and category are required.' },
      });
      return;
    }

    // 1. Update core service
    const { data: updatedService, error: serviceError } = await supabaseAdmin
      .from('services')
      .update({
        name,
        code: code || undefined,
        category,
        description: description || `Government ${name} service`,
        processing_time_days: Number(processingTimeDays) || 7,
        fee_amount: Number(feeAmount) || 0.00,
        department_id: departmentId || null,
        is_active: isActive !== undefined ? isActive : true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (serviceError || !updatedService) {
      res.status(400).json({
        success: false,
        error: { code: 'SERVICE_UPDATE_FAILED', message: serviceError?.message || 'Failed to update service.' },
      });
      return;
    }

    // 2. Replace document_requirements
    if (Array.isArray(documents)) {
      await supabaseAdmin.from('document_requirements').delete().eq('service_id', id);

      if (documents.length > 0) {
        const docRows = documents.map((doc: any) => ({
          service_id: id,
          name: typeof doc === 'string' ? doc : doc.name,
          description: doc.instructions || `Required document for ${name}`,
          instructions: doc.instructions || null,
          is_required: doc.isRequired ?? true,
        }));
        await supabaseAdmin.from('document_requirements').insert(docRows);
      }
    }

    // 3. Extra state documents
    if (documentOption === 'STATE_SPECIFIC' && Array.isArray(extraStateDocuments) && extraStateDocuments.length > 0) {
      const extraRows = extraStateDocuments.map((doc: any) => ({
        service_id: id,
        name: typeof doc === 'string' ? doc : doc.name,
        description: `Jurisdiction Specific Document (${doc.state || 'State'}): ${doc.instructions || ''}`,
        instructions: doc.instructions || null,
        is_required: true,
      }));
      await supabaseAdmin.from('document_requirements').insert(extraRows);
    }

    // 4. Update Office linkings if scope updated
    let targetOfficesQuery = supabaseAdmin.from('offices').select('id');
    if (!addToAllOffices && Array.isArray(selectedDistricts) && selectedDistricts.length > 0) {
      const escapedList = selectedDistricts.map((item: string) => `"${item.replace(/"/g, '""')}"`).join(',');
      targetOfficesQuery = targetOfficesQuery.or(`district.in.(${escapedList}),state.in.(${escapedList})`);
    }

    const { data: targetOffices } = await targetOfficesQuery;

    if (targetOffices && targetOffices.length > 0) {
      const officeServiceRows = targetOffices.map((off) => ({
        office_id: off.id,
        service_id: id,
        status: 'ACTIVE',
      }));
      await supabaseAdmin.from('office_services').upsert(officeServiceRows, { onConflict: 'office_id,service_id' });
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'UPDATE_GLOBAL_SERVICE',
      entity_type: 'service',
      entity_id: id,
      details: `Super Admin updated global service '${name}' (${id}).`,
    });

    res.json({
      success: true,
      data: {
        service: updatedService,
        officeCount: targetOffices?.length || 0,
        message: 'Global government service successfully updated.',
      },
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const deleteGlobalService = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const superAdminId = req.user?.id;

    // Delete dependent tables first
    await supabaseAdmin.from('document_requirements').delete().eq('service_id', id);
    await supabaseAdmin.from('office_services').delete().eq('service_id', id);
    const { error } = await supabaseAdmin.from('services').delete().eq('id', id);

    if (error) {
      res.status(400).json({
        success: false,
        error: { code: 'DELETE_FAILED', message: error.message },
      });
      return;
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'DELETE_GLOBAL_SERVICE',
      entity_type: 'service',
      entity_id: id,
      details: `Super Admin deleted service ID: ${id}.`,
    });

    res.json({
      success: true,
      message: 'Government service permanently deleted.',
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const toggleGlobalServiceStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const superAdminId = req.user?.id;

    const { data: updatedService, error } = await supabaseAdmin
      .from('services')
      .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !updatedService) {
      res.status(400).json({
        success: false,
        error: { code: 'TOGGLE_FAILED', message: error?.message || 'Failed to update service status.' },
      });
      return;
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: superAdminId,
      actor_user_name: req.user?.fullName || 'Super Admin',
      actor_user_role: 'superadmin',
      action: 'TOGGLE_SERVICE_STATUS',
      entity_type: 'service',
      entity_id: id,
      details: `Super Admin set service '${updatedService.name}' status to ${isActive ? 'ACTIVE' : 'INACTIVE'}.`,
    });

    res.json({
      success: true,
      data: updatedService,
      message: `Service status updated to ${isActive ? 'ACTIVE' : 'INACTIVE'}.`,
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

