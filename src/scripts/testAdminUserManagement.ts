import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { UserModel, UserRole } from '../models/user.model';

async function runAdminUserManagementTests() {
  console.log('========================================================================');
  console.log('🛡️  STRIDEX: ADMIN USER & ROLE MANAGEMENT TEST SUITE');
  console.log('========================================================================');

  await connectDB();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;
  console.log(`📡 In-process test server running at ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP: Create isolated test accounts
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Setting Up Test Accounts (Admin, Customer, Inactive) ---');
    const testAdminEmail = 'test_primary_admin@stridex.com';
    const testCustomerEmail = 'test_regular_customer@stridex.com';
    const testTargetUserEmail = 'test_role_target@stridex.com';
    const testPassword = 'Password2026!';

    await UserModel.deleteMany({
      email: { $in: [testAdminEmail, testCustomerEmail, testTargetUserEmail] },
    });

    // Create primary test Admin
    const adminUser = await UserModel.create({
      fullName: 'Primary Test Admin',
      email: testAdminEmail,
      password: testPassword,
      phone: '0771112222',
      role: UserRole.ADMIN,
      isActive: true,
    });

    // Create regular Customer
    const customerUser = await UserModel.create({
      fullName: 'Regular Shopper',
      email: testCustomerEmail,
      password: testPassword,
      phone: '0773334444',
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    // Create role transition Target User (Starts as CUSTOMER)
    const targetUser = await UserModel.create({
      fullName: 'Role Transition Target',
      email: testTargetUserEmail,
      password: testPassword,
      phone: '0775556666',
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    // Log in Admin
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testAdminEmail, password: testPassword }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data?.accessToken;
    assert(Boolean(adminToken), 'Administrator authenticated successfully');

    // Log in Customer
    const customerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCustomerEmail, password: testPassword }),
    });
    const customerLoginData = await customerLoginRes.json();
    const customerToken = customerLoginData.data?.accessToken;
    assert(Boolean(customerToken), 'Customer authenticated successfully');

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    const customerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    };

    // ------------------------------------------------------------------------
    // TEST 1: Admin can view all users and retrieve statistics
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Test 1: Admin Views Users Directory & Statistics ---');
    const getUsersRes = await fetch(`${baseUrl}/admin/users?page=1&limit=10`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const getUsersData = await getUsersRes.json();
    assert(getUsersRes.status === 200, 'GET /admin/users returns HTTP 200');
    assert(getUsersData.success === true, 'Response indicates success: true');
    assert(Array.isArray(getUsersData.data), 'Returns users array');
    assert(getUsersData.data.length > 0, 'Users array is non-empty');
    assert(typeof getUsersData.stats?.totalUsers === 'number', 'Returns stats.totalUsers');
    assert(typeof getUsersData.stats?.totalCustomers === 'number', 'Returns stats.totalCustomers');
    assert(typeof getUsersData.stats?.totalInventoryManagers === 'number', 'Returns stats.totalInventoryManagers');
    assert(typeof getUsersData.stats?.totalAdmins === 'number', 'Returns stats.totalAdmins');
    assert(typeof getUsersData.stats?.activeUsers === 'number', 'Returns stats.activeUsers');
    assert(typeof getUsersData.pagination?.totalPages === 'number', 'Returns pagination metadata');

    // Verify passwords are excluded
    const sampleUser = getUsersData.data[0];
    assert(sampleUser.password === undefined, 'Passwords are strictly excluded from response');

    // ------------------------------------------------------------------------
    // TEST 2: Admin can search and filter users
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Test 2: Search and Filter Users ---');
    // Search by email substring
    const searchRes = await fetch(`${baseUrl}/admin/users?search=role_target`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const searchData = await searchRes.json();
    assert(searchRes.status === 200, 'Search by keyword returns HTTP 200');
    assert(
      searchData.data.some((u: any) => u.email === testTargetUserEmail),
      `Found user matching search: ${testTargetUserEmail}`
    );

    // Filter by role: CUSTOMER
    const filterRoleRes = await fetch(`${baseUrl}/admin/users?role=CUSTOMER`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const filterRoleData = await filterRoleRes.json();
    assert(filterRoleRes.status === 200, 'Filter by role returns HTTP 200');
    assert(
      filterRoleData.data.every((u: any) => u.role === 'CUSTOMER'),
      'All filtered users strictly belong to CUSTOMER role'
    );

    // Filter by status: active
    const filterStatusRes = await fetch(`${baseUrl}/admin/users?status=active`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const filterStatusData = await filterStatusRes.json();
    assert(filterStatusRes.status === 200, 'Filter by status returns HTTP 200');
    assert(
      filterStatusData.data.every((u: any) => u.isActive === true),
      'All filtered users are active accounts'
    );

    // ------------------------------------------------------------------------
    // TEST 3: Admin can view single user details
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Test 3: Admin Views Single User Details ---');
    const getUserDetailRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const getUserDetailData = await getUserDetailRes.json();
    assert(getUserDetailRes.status === 200, 'GET /admin/users/:id returns HTTP 200');
    assert(getUserDetailData.data?.email === testTargetUserEmail, 'Returns correct user email');
    assert(getUserDetailData.data?.role === 'CUSTOMER', 'Returns correct current role');
    assert(getUserDetailData.data?.orderStats !== undefined, 'Returns customer shopping statistics');

    // ------------------------------------------------------------------------
    // TEST 4: Admin changes CUSTOMER to INVENTORY_MANAGER
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Test 4: Promote CUSTOMER to INVENTORY_MANAGER ---');
    const promoteRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: UserRole.INVENTORY_MANAGER }),
    });
    const promoteData = await promoteRes.json();
    assert(promoteRes.status === 200, 'PATCH /admin/users/:id/role returns HTTP 200');
    assert(promoteData.data?.role === UserRole.INVENTORY_MANAGER, 'User role updated to INVENTORY_MANAGER');

    const dbCheck1 = await UserModel.findById(targetUser._id);
    assert(dbCheck1?.role === UserRole.INVENTORY_MANAGER, 'Role persists in MongoDB Atlas');

    // ------------------------------------------------------------------------
    // TEST 5: Admin changes INVENTORY_MANAGER to CUSTOMER (Demote)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Test 5: Change INVENTORY_MANAGER to CUSTOMER ---');
    const demoteRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: UserRole.CUSTOMER }),
    });
    const demoteData = await demoteRes.json();
    assert(demoteRes.status === 200, 'PATCH /admin/users/:id/role returns HTTP 200');
    assert(demoteData.data?.role === UserRole.CUSTOMER, 'User role updated back to CUSTOMER');

    const dbCheck2 = await UserModel.findById(targetUser._id);
    assert(dbCheck2?.role === UserRole.CUSTOMER, 'Demotion persists in MongoDB Atlas');

    // ------------------------------------------------------------------------
    // TEST 6: Unauthorized customers CANNOT access Admin User APIs
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Test 6: Authorization Enforcement (Customer Access Blocked) ---');
    const unauthorizedListRes = await fetch(`${baseUrl}/admin/users`, {
      method: 'GET',
      headers: customerHeaders,
    });
    assert(unauthorizedListRes.status === 403, 'Customer blocked from GET /admin/users (HTTP 403)');

    const unauthorizedRoleRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}/role`, {
      method: 'PATCH',
      headers: customerHeaders,
      body: JSON.stringify({ role: UserRole.ADMIN }),
    });
    assert(unauthorizedRoleRes.status === 403, 'Customer blocked from role assignment (HTTP 403)');

    const unauthorizedStatusRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}/status`, {
      method: 'PATCH',
      headers: customerHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    assert(unauthorizedStatusRes.status === 403, 'Customer blocked from status update (HTTP 403)');

    // Unauthenticated request
    const unauthRes = await fetch(`${baseUrl}/admin/users`, {
      method: 'GET',
    });
    assert(unauthRes.status === 401, 'Unauthenticated request rejected with HTTP 401');

    // ------------------------------------------------------------------------
    // TEST 7: Customers cannot change their own roles
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Test 7: Privilege Escalation Prevention (Self-Promotion) ---');
    const selfPromoteRes = await fetch(`${baseUrl}/admin/users/${customerUser._id}/role`, {
      method: 'PATCH',
      headers: customerHeaders,
      body: JSON.stringify({ role: UserRole.ADMIN }),
    });
    assert(selfPromoteRes.status === 403, 'Self-promotion attempt strictly blocked with HTTP 403');

    const customerCheck = await UserModel.findById(customerUser._id);
    assert(customerCheck?.role === UserRole.CUSTOMER, 'Customer role remains unchanged');

    // ------------------------------------------------------------------------
    // TEST 8: Admin can deactivate and reactivate a user account
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Test 8: Account Deactivation and Reactivation ---');
    // Deactivate target user
    const deactivateRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const deactivateData = await deactivateRes.json();
    assert(deactivateRes.status === 200, 'Deactivate user returns HTTP 200');
    assert(deactivateData.data?.isActive === false, 'Account marked isActive: false');

    const dbCheckInactive = await UserModel.findById(targetUser._id);
    assert(dbCheckInactive?.isActive === false, 'Deactivation persists in MongoDB');

    // Reactivate target user
    const reactivateRes = await fetch(`${baseUrl}/admin/users/${targetUser._id}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: true }),
    });
    const reactivateData = await reactivateRes.json();
    assert(reactivateRes.status === 200, 'Reactivate user returns HTTP 200');
    assert(reactivateData.data?.isActive === true, 'Account restored to isActive: true');

    // ------------------------------------------------------------------------
    // TEST 9: Deactivated user CANNOT log in
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Test 9: Deactivated User Login Blocked ---');
    // Deactivate Customer account for login test
    await UserModel.findByIdAndUpdate(customerUser._id, { isActive: false });

    const blockedLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCustomerEmail, password: testPassword }),
    });
    const blockedLoginData = await blockedLoginRes.json();
    assert(blockedLoginRes.status === 403, 'Login attempt by deactivated user rejected with HTTP 403');
    assert(
      blockedLoginData.message?.toLowerCase().includes('deactivated'),
      'Error message clarifies account has been deactivated'
    );

    // ------------------------------------------------------------------------
    // TEST 10: Deactivated user CANNOT access protected APIs using old token
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Test 10: Deactivated User Live Token Invalidation ---');
    // Attempt to access protected endpoint (/orders) using previously valid customerToken
    const blockedApiRes = await fetch(`${baseUrl}/orders`, {
      method: 'GET',
      headers: customerHeaders,
    });
    const blockedApiData = await blockedApiRes.json();
    assert(blockedApiRes.status === 403, 'Old token rejected on protected API with HTTP 403');
    assert(
      blockedApiData.message?.toLowerCase().includes('deactivated'),
      'Backend middleware informs account is deactivated'
    );

    // Restore customer to active
    await UserModel.findByIdAndUpdate(customerUser._id, { isActive: true });

    // ------------------------------------------------------------------------
    // TEST 11: Protect the last active administrator from demotion or deactivation
    // ------------------------------------------------------------------------
    console.log('\n--- 12. Test 11: Last Active Administrator Protection ---');
    // Ensure only 1 active admin exists for this test
    const allAdmins = await UserModel.find({ role: UserRole.ADMIN, isActive: true });
    console.log(`Current active admins in database: ${allAdmins.length}`);

    // If there's only 1 active admin (or if we test on an admin when all others are inactive)
    // Let's create a single solo admin scenario:
    const soloAdminEmail = 'solo_test_admin@stridex.com';
    await UserModel.deleteOne({ email: soloAdminEmail });
    const soloAdmin = await UserModel.create({
      fullName: 'Solo Admin',
      email: soloAdminEmail,
      password: testPassword,
      role: UserRole.ADMIN,
      isActive: true,
    });

    // Temporarily make other admins inactive to guarantee count = 1
    const originalActiveAdmins = await UserModel.find({
      _id: { $ne: soloAdmin._id },
      role: UserRole.ADMIN,
      isActive: true,
    });
    await UserModel.updateMany(
      { _id: { $in: originalActiveAdmins.map((a) => a._id) } },
      { isActive: false }
    );

    // Login solo admin
    const soloLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: soloAdminEmail, password: testPassword }),
    });
    const soloLoginData = await soloLoginRes.json();
    const soloToken = soloLoginData.data?.accessToken;
    const soloHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${soloToken}`,
    };

    // Attempt to demote the last active admin
    const demoteLastAdminRes = await fetch(`${baseUrl}/admin/users/${soloAdmin._id}/role`, {
      method: 'PATCH',
      headers: soloHeaders,
      body: JSON.stringify({ role: UserRole.CUSTOMER }),
    });
    const demoteLastAdminData = await demoteLastAdminRes.json();
    assert(demoteLastAdminRes.status === 400, 'Demoting last active admin rejected with HTTP 400');
    assert(
      demoteLastAdminData.message?.toLowerCase().includes('cannot demote'),
      'Informs cannot demote last active administrator'
    );

    // Attempt to deactivate the last active admin
    const deactivateLastAdminRes = await fetch(`${baseUrl}/admin/users/${soloAdmin._id}/status`, {
      method: 'PATCH',
      headers: soloHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const deactivateLastAdminData = await deactivateLastAdminRes.json();
    assert(deactivateLastAdminRes.status === 400, 'Deactivating last active admin rejected with HTTP 400');
    assert(
      deactivateLastAdminData.message?.toLowerCase().includes('cannot deactivate'),
      'Informs cannot deactivate last active administrator'
    );

    // Restore original admins
    await UserModel.updateMany(
      { _id: { $in: originalActiveAdmins.map((a) => a._id) } },
      { isActive: true }
    );
    await UserModel.deleteOne({ email: soloAdminEmail });

    // ------------------------------------------------------------------------
    // TEST 12: Existing Admin & Inventory Manager functionality regression
    // ------------------------------------------------------------------------
    console.log('\n--- 13. Test 12: Existing Admin & Inventory Manager Regression ---');
    const adminStatsRes = await fetch(`${baseUrl}/admin/dashboard/stats`, {
      method: 'GET',
      headers: adminHeaders,
    });
    assert(adminStatsRes.status === 200, 'Admin can still access GET /admin/dashboard/stats (HTTP 200)');

    const customersDirRes = await fetch(`${baseUrl}/admin/customers`, {
      method: 'GET',
      headers: adminHeaders,
    });
    assert(customersDirRes.status === 200, 'Admin can still access GET /admin/customers (HTTP 200)');

    // Cleanup test data
    await UserModel.deleteMany({
      email: { $in: [testAdminEmail, testCustomerEmail, testTargetUserEmail, soloAdminEmail] },
    });
  } catch (err: any) {
    console.error('Test suite error:', err);
    failed++;
  } finally {
    server.close();
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(`📊 ADMIN USER & ROLE MANAGEMENT RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminUserManagementTests();
