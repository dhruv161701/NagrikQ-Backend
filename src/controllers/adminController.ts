import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { supabaseAdmin } from '../config/supabase';

export const createChangeRequest = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const { serviceId, serviceName, officeName, currentDocumentNames, proposedDocumentNames, addedDocumentName, reason } = req.body;

    if (!serviceId || !addedDocumentName || !reason) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'serviceId, addedDocumentName, and reason are required.' },
      });
      return;
    }

    const requestNumber = `CR-2026-${Math.floor(100 + Math.random() * 900)}`;

    const { data: cr, error } = await supabaseAdmin
      .from('service_change_requests')
      .insert({
        request_number: requestNumber,
        service_id: serviceId,
        requested_by_admin_id: adminId,
        office_name: officeName || 'Office Admin',
        current_document_names: currentDocumentNames || [],
        proposed_document_names: proposedDocumentNames || [],
        added_document_name: addedDocumentName,
        reason: reason,
        status: 'PENDING',
      })
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } });
      return;
    }

    // Log security audit log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: adminId,
      actor_user_name: req.user?.fullName || 'Admin',
      actor_user_role: req.user?.role || 'admin',
      action: 'CREATE_CHANGE_REQUEST',
      entity_type: 'service_change_request',
      entity_id: cr.id,
      details: `Created Change Request ${requestNumber} to add document '${addedDocumentName}' to ${serviceName || 'Service'}. Reason: ${reason}`,
    });

    res.status(201).json({ success: true, data: cr } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getChangeRequests = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { data: crs, error } = await supabaseAdmin
      .from('service_change_requests')
      .select('*, services(name, code)')
      .order('submitted_at', { ascending: false });

    if (error || !crs) {
      console.error('[GET_CHANGE_REQUESTS_ERROR]', error);
      const { data: fallbackCrs } = await supabaseAdmin
        .from('service_change_requests')
        .select('*')
        .order('submitted_at', { ascending: false });

      res.json({ success: true, data: fallbackCrs || [] } as ApiResponse);
      return;
    }

    res.json({ success: true, data: crs } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error || !logs) {
      res.json({ success: true, data: [] } as ApiResponse);
      return;
    }

    res.json({ success: true, data: logs } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const createEmployeeUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const {
      fullName,
      email,
      phone,
      employeeId,
      designation,
      aadhaarLast4,
      aadhaarVerified,
      verificationRef,
      department,
      departmentId,
      district,
      taluka,
      officeId,
      counterId,
      counterNumber,
      assignedServices,
      permissions,
      tempPassword,
      breakStartTime,
      breakEndTime,
    } = req.body;

    if (!fullName || !email || !employeeId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Full Name, Official Email, and Employee ID are required.' },
      });
      return;
    }

    // Security Scope Check: Verify Admin's authorized office scope if admin is restricted
    if (req.user?.role === 'admin') {
      const { data: adminStaff } = await supabaseAdmin
        .from('staff_profiles')
        .select('office_id')
        .eq('id', adminId)
        .maybeSingle();

      if (adminStaff?.office_id && officeId && adminStaff.office_id !== officeId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN_SCOPE', message: 'Admin can only create employees within their authorized office scope.' },
        });
        return;
      }
    }

    const generatedPassword = tempPassword || `NagrikQ@${Math.floor(100000 + Math.random() * 900000)}`;

    // 1. Create Supabase Auth User securely via server-side Supabase Admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'employee',
      },
    });

    if (authError || !authData.user) {
      res.status(400).json({
        success: false,
        error: { code: 'AUTH_CREATION_FAILED', message: authError?.message || 'Failed to create employee Auth account.' },
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
        role: 'employee',
        onboarding_completed: true,
        district: district || 'Rajkot',
      },
      { onConflict: 'id' }
    );

    // 3. Create staff_profile row (Aadhaar is strictly last 4 digits only!)
    const staffPayload: any = {
      id: userId,
      user_id: userId,
      employee_id: employeeId,
      designation: designation || 'Junior Officer',
      department: department || 'Revenue Department',
      department_id: departmentId || null,
      district: district || 'Rajkot',
      taluka: taluka || 'Rajkot',
      office_id: officeId || null,
      counter_id: counterId || null,
      phone: phone || '+91 9876543210',
      aadhaar_last4: aadhaarLast4 ? String(aadhaarLast4).slice(-4) : null,
      aadhaar_verified: !!aadhaarVerified,
      verification_ref: generatedPassword,
      permissions: permissions || ['VIEW_APPLICATIONS', 'REVIEW_APPLICATION', 'CALL_NEXT_TOKEN'],
      role: 'employee',
      status: 'ACTIVE',
      break_start_time: breakStartTime || '01:00 PM',
      break_end_time: breakEndTime || '01:30 PM',
    };

    let { data: staffProfile, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .upsert(staffPayload, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (staffError) {
      console.warn('Upsert staff_profile with break columns failed, retrying without:', staffError.message);
      delete staffPayload.break_start_time;
      delete staffPayload.break_end_time;
      const { data: retryStaff } = await supabaseAdmin
        .from('staff_profiles')
        .upsert(staffPayload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      staffProfile = retryStaff;
    }

    // 4. Create officers row for queue/counter compatibility
    await supabaseAdmin.from('officers').upsert(
      {
        user_id: userId,
        employee_code: employeeId,
        designation: designation || 'Junior Officer',
        counter_number: counterNumber || 'C-01',
        office_id: officeId || null,
        is_active: true,
        assigned_service_ids: assignedServices || [],
      },
      { onConflict: 'employee_code' }
    );

    // 5. Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: adminId,
      actor_user_name: req.user?.fullName || 'Admin',
      actor_user_role: req.user?.role || 'admin',
      action: 'CREATE_EMPLOYEE_ACCOUNT',
      entity_type: 'staff_profile',
      entity_id: userId,
      details: `Created Employee account for ${fullName} (${email}) - Employee ID: ${employeeId}.`,
    });

    res.status(201).json({
      success: true,
      data: {
        employee: staffProfile || { id: userId, email, fullName, employeeId, role: 'employee' },
        credentials: {
          email,
          temporaryPassword: generatedPassword,
          note: 'Provide these credentials securely to the employee.',
        },
      },
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getEmployeesList = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    let query = supabaseAdmin.from('staff_profiles').select('*').eq('role', 'employee');

    // Scoping for admin (if assigned to an office)
    if (req.user?.role === 'admin') {
      const { data: adminStaff } = await supabaseAdmin
        .from('staff_profiles')
        .select('office_id')
        .eq('id', adminId)
        .maybeSingle();

      if (adminStaff?.office_id) {
        const { count } = await supabaseAdmin
          .from('staff_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('office_id', adminStaff.office_id)
          .eq('role', 'employee');
        if (count && count > 0) {
          query = query.eq('office_id', adminStaff.office_id);
        }
      }
    }

    const { data: staffList, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.warn('[GET_EMPLOYEES_WARN]', error);
    }

    const actualStaff = staffList || [];

    // If staffList is empty, check if there are users with role = 'employee' in profiles
    if (actualStaff.length === 0) {
      const { data: empProfiles } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('role', 'employee');

      if (!empProfiles || empProfiles.length === 0) {
        // Honest empty state when no employees exist in DB
        res.json({ success: true, data: [] } as ApiResponse);
        return;
      }

      const userIds = empProfiles.map((p: any) => p.id);
      const { data: officerRecs } = await supabaseAdmin
        .from('officers')
        .select('user_id, counter_number, assigned_service_ids, designation')
        .in('user_id', userIds);

      const officerMap: Record<string, any> = {};
      (officerRecs || []).forEach((o: any) => {
        officerMap[o.user_id] = o;
      });

      const mappedFromProfiles = empProfiles.map((p: any, idx: number) => {
        const off = officerMap[p.id] || {};
        return {
          id: p.id,
          user_id: p.id,
          employee_id: `EMP-${1000 + idx + 1}`,
          designation: off.designation || 'Junior Verification Officer',
          department: 'Revenue Department',
          district: p.district || 'Rajkot',
          taluka: 'Rajkot City',
          counter_number: off.counter_number || `C-0${(idx % 5) + 1}`,
          phone: p.phone || '+91 9876543210',
          status: 'ACTIVE',
          break_start_time: '01:00 PM',
          break_end_time: '01:30 PM',
          full_name: p.full_name,
          email: p.email,
          assigned_services: off.assigned_service_ids || [],
        };
      });
      res.json({ success: true, data: mappedFromProfiles } as ApiResponse);
      return;
    }

    // Fetch matching profiles and officers to ensure authoritative counter and assigned services are attached
    const userIds = actualStaff.map((s: any) => s.user_id || s.id).filter(Boolean);
    const profileMap: Record<string, any> = {};
    const officerMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', userIds);

      (profs || []).forEach((p: any) => {
        profileMap[p.id] = p;
      });

      const { data: officerRecs } = await supabaseAdmin
        .from('officers')
        .select('user_id, counter_number, assigned_service_ids, designation')
        .in('user_id', userIds);

      (officerRecs || []).forEach((o: any) => {
        officerMap[o.user_id] = o;
      });
    }

    const formattedEmployees = actualStaff.map((emp: any) => {
      const uId = emp.user_id || emp.id;
      const p = profileMap[uId] || {};
      const off = officerMap[uId] || {};
      return {
        ...emp,
        counter_number: off.counter_number || emp.counter_number || 'C-01',
        assigned_services: off.assigned_service_ids || emp.assigned_service_ids || [],
        full_name: p.full_name || emp.full_name || 'Counter Officer',
        email: p.email || emp.email || '',
        phone: p.phone || emp.phone || '+91 9876543210',
        break_start_time: emp.break_start_time || '01:00 PM',
        break_end_time: emp.break_end_time || '01:30 PM',
      };
    });

    res.json({ success: true, data: formattedEmployees } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const setupOfficeConfig = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const { officeInfo, selectedServiceIds, counters, queueConfig } = req.body;

    if (!officeInfo?.name || !officeInfo?.district) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Office name and district are required.' },
      });
      return;
    }

    // 1. Create or update office
    const officeCode = officeInfo.code || `OFF-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: office, error: officeError } = await supabaseAdmin
      .from('offices')
      .upsert(
        {
          name: officeInfo.name,
          code: officeCode,
          district: officeInfo.district,
          subdivision: officeInfo.subdivision || officeInfo.district,
          taluka: officeInfo.taluka || officeInfo.city || officeInfo.district,
          city: officeInfo.city || officeInfo.district,
          address: officeInfo.address || 'Government Office Complex',
          contact_number: officeInfo.contactNumber || '0281-2451000',
          email: officeInfo.email || null,
          total_counters: counters?.length || 5,
          opening_time: officeInfo.openingTime || '09:00 AM',
          closing_time: officeInfo.closingTime || '05:00 PM',
          working_days: officeInfo.workingDays || 'Monday - Saturday',
          status: 'ACTIVE',
        },
        { onConflict: 'code' }
      )
      .select('*')
      .single();

    if (officeError || !office) {
      res.status(400).json({ success: false, error: { code: 'OFFICE_SETUP_FAILED', message: officeError?.message } });
      return;
    }

    const officeId = office.id;

    // 2. Link selected services to office via office_services junction table
    if (Array.isArray(selectedServiceIds) && selectedServiceIds.length > 0) {
      const officeServiceRows = selectedServiceIds.map((serviceId: string) => ({
        office_id: officeId,
        service_id: serviceId,
        status: 'ACTIVE',
      }));

      await supabaseAdmin.from('office_services').upsert(officeServiceRows, { onConflict: 'office_id,service_id' });
    }

    // 3. Setup counters
    if (Array.isArray(counters) && counters.length > 0) {
      const counterRows = counters.map((c: any, index: number) => ({
        office_id: officeId,
        counter_number: c.number || `C-0${index + 1}`,
        name: c.name || `Counter ${index + 1}`,
        type: c.type || 'GENERAL',
        status: 'ACTIVE',
        queue_enabled: true,
      }));

      await supabaseAdmin.from('counters').upsert(counterRows, { onConflict: 'office_id,counter_number' });
    }

    // 4. Update Admin staff_profile office_id linkage
    await supabaseAdmin
      .from('staff_profiles')
      .update({ office_id: officeId, district: officeInfo.district, taluka: officeInfo.taluka })
      .eq('id', adminId);

    // 5. Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: adminId,
      actor_user_name: req.user?.fullName || 'Admin',
      actor_user_role: req.user?.role || 'admin',
      action: 'SETUP_OFFICE_CONFIGURATION',
      entity_type: 'office',
      entity_id: officeId,
      details: `Admin configured office '${officeInfo.name}' in ${officeInfo.district} with ${selectedServiceIds?.length || 0} services and ${counters?.length || 0} counters.`,
    });

    res.status(200).json({
      success: true,
      data: {
        office,
        message: 'Office configuration successfully activated!',
      },
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const updateEmployeeUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    const {
      fullName,
      designation,
      counterNumber,
      phone,
      status,
      district,
      taluka,
      breakStartTime,
      breakEndTime,
      onBreak,
      assignedServices,
    } = req.body;

    // 1. Update staff_profiles table (safely handling schema-cache if counter_number column is pending migration)
    const updatePayload: any = {};
    if (designation !== undefined) updatePayload.designation = designation;
    if (counterNumber !== undefined) updatePayload.counter_number = counterNumber;
    if (phone !== undefined) updatePayload.phone = phone;
    if (status !== undefined) updatePayload.status = status;
    if (district !== undefined) updatePayload.district = district;
    if (taluka !== undefined) updatePayload.taluka = taluka;
    if (breakStartTime !== undefined) updatePayload.break_start_time = breakStartTime;
    if (breakEndTime !== undefined) updatePayload.break_end_time = breakEndTime;
    if (onBreak !== undefined) updatePayload.on_break = onBreak;
    if (assignedServices !== undefined) updatePayload.assigned_service_ids = assignedServices;

    let { data: updatedStaff, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (staffError) {
      console.warn('Update staff_profile failed, retrying with base columns:', staffError.message);
      // Remove columns that might not exist in PostgREST schema cache
      delete updatePayload.counter_number;
      delete updatePayload.assigned_service_ids;
      delete updatePayload.break_start_time;
      delete updatePayload.break_end_time;
      delete updatePayload.on_break;

      const { data: retryStaff, error: retryError } = await supabaseAdmin
        .from('staff_profiles')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (retryError) {
        res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: retryError.message } });
        return;
      }
      updatedStaff = retryStaff;
    }

    // 2. Also update profiles table if fullName is passed
    if (fullName) {
      await supabaseAdmin.from('profiles').update({ full_name: fullName }).eq('id', id);
    }

    // 3. Authoritatively update officers table (Fix 1, Fix 10, Fix 15)
    if (counterNumber || status || assignedServices) {
      await supabaseAdmin.from('officers').upsert({
        user_id: id,
        counter_number: counterNumber || undefined,
        assigned_service_ids: assignedServices || undefined,
        is_active: status === 'ACTIVE',
      }, { onConflict: 'user_id' });
    }

    // 4. Authoritatively assign counter in counters table
    if (counterNumber) {
      try {
        await supabaseAdmin
          .from('counters')
          .update({ assigned_employee_id: id })
          .eq('counter_number', counterNumber);
      } catch (counterErr) {
        console.warn('Counters table update note:', counterErr);
      }
    }

    // 5. Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: adminId,
      actor_user_name: req.user?.fullName || 'Admin',
      actor_user_role: req.user?.role || 'admin',
      action: 'UPDATE_EMPLOYEE_ACCOUNT',
      entity_type: 'staff_profile',
      entity_id: id,
      details: `Admin updated employee details for user ${id}. Assigned counter: ${counterNumber || 'unchanged'}. Status: ${status || 'unchanged'}.`,
    });

    const responseData = {
      ...(updatedStaff || { id }),
      counter_number: counterNumber || updatedStaff?.counter_number || 'C-01',
      assigned_services: assignedServices || updatedStaff?.assigned_service_ids || [],
    };

    res.json({
      success: true,
      data: responseData,
      message: 'Employee updated successfully.',
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const deleteEmployeeUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    // Delete or deactivate from staff_profiles & officers
    await supabaseAdmin.from('officers').delete().eq('user_id', id);
    const { error } = await supabaseAdmin.from('staff_profiles').delete().eq('id', id);

    if (error) {
      // If foreign key constraint prevents hard delete, soft delete / set INACTIVE
      await supabaseAdmin.from('staff_profiles').update({ status: 'INACTIVE' }).eq('id', id);
    }

    // Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_user_id: adminId,
      actor_user_name: req.user?.fullName || 'Admin',
      actor_user_role: req.user?.role || 'admin',
      action: 'DELETE_EMPLOYEE_ACCOUNT',
      entity_type: 'staff_profile',
      entity_id: id,
      details: `Admin removed employee account ${id}.`,
    });

    res.json({
      success: true,
      message: 'Employee successfully removed from office.',
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

