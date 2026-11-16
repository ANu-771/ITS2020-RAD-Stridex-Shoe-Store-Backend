import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import http from 'http';
import app from '../app';
import { connectDB } from '../config/db';
import { UserModel, UserRole } from '../models/user.model';
import { PasswordResetOtpModel } from '../models/passwordResetOtp.model';
import { getTestOtp } from '../service/email.service';

async function runForgotPasswordTests() {
  console.log('========================================================================');
  console.log('🔐 STRIDEX: FORGOT PASSWORD & EMAIL OTP VERIFICATION TEST SUITE');
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
    const testEmail = 'otp_test_customer@stridex.com';
    const originalPassword = 'InitialSecurePassword2026!';
    const updatedPassword = 'NewResetPassword2026!';

    // 0. Setup clean test customer account
    console.log('\n--- 1. Setting up Test Customer Account ---');
    await UserModel.deleteOne({ email: testEmail });
    await PasswordResetOtpModel.deleteMany({ email: testEmail });

    const user = await UserModel.create({
      fullName: 'OTP Test Customer',
      email: testEmail,
      password: originalPassword,
      phone: '0779998888',
      role: UserRole.CUSTOMER,
      isActive: true,
    });
    assert(Boolean(user._id), `Test customer created (${testEmail})`);

    // Verify customer can log in with initial password
    const initialLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: originalPassword }),
    });
    const initialLoginJson = await initialLoginRes.json();
    assert(initialLoginRes.status === 200 && Boolean(initialLoginJson.data?.accessToken), 'Customer logs in with initial password');

    // 1. Request OTP using unregistered email: Verify generic response without revealing account status
    console.log('\n--- 2. Request OTP for Unregistered Email (Anti-Enumeration) ---');
    const unregisteredEmail = 'nonexistent_user_999@stridex.com';
    const unregRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unregisteredEmail }),
    });
    const unregJson = await unregRes.json();
    assert(unregRes.status === 200, 'Unregistered email returns HTTP 200');
    assert(unregJson.success === true, 'Response indicates success');
    assert(
      unregJson.message === 'If an account with that email exists, a 6-digit verification code has been sent.',
      'Returns generic response without leaking user existence'
    );
    const unregDbOtp = await PasswordResetOtpModel.findOne({ email: unregisteredEmail });
    assert(unregDbOtp === null, 'No OTP generated in database for non-existent account');

    // 2. Request OTP using registered email
    console.log('\n--- 3. Request OTP for Registered Customer Account ---');
    const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    const forgotJson = await forgotRes.json();
    assert(forgotRes.status === 200, 'Registered email returns HTTP 200');
    assert(forgotJson.success === true, 'Response indicates success');
    assert(
      forgotJson.message === 'If an account with that email exists, a 6-digit verification code has been sent.',
      'Returns identical generic response'
    );

    // 3. Receive OTP: Verify 6-digit numeric OTP was generated and saved hashed
    console.log('\n--- 4. Verify Generated OTP Security & Properties ---');
    const sentOtp = getTestOtp(testEmail);
    assert(Boolean(sentOtp), 'OTP captured by email dispatch service');
    assert(/^\d{6}$/.test(sentOtp || ''), 'Generated OTP is strictly a 6-digit numeric code');

    const otpRecord = await PasswordResetOtpModel.findOne({ email: testEmail, isUsed: false }).sort({ createdAt: -1 });
    assert(Boolean(otpRecord), 'OTP record stored in MongoDB Atlas');
    assert(otpRecord?.otpHash !== sentOtp, 'OTP is securely hashed in database (NOT plain text)');
    assert(otpRecord?.attempts === 0, 'Initial verification attempts set to 0');
    assert(otpRecord?.maxAttempts === 5, 'Maximum allowed attempts set to 5');
    assert(
      otpRecord!.expiresAt.getTime() > Date.now() + 4 * 60 * 1000,
      'OTP expiration configured for 5 minutes'
    );

    // 4. Test Resend Cooldown (Within 60 Seconds -> HTTP 429)
    console.log('\n--- 5. Cooldown Protection: Immediate Resend Rejection ---');
    const cooldownRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    const cooldownJson = await cooldownRes.json();
    assert(cooldownRes.status === 429, 'Immediate resend rejected with HTTP 429 Too Many Requests');
    assert(
      cooldownJson.message.includes('seconds before requesting a new verification code'),
      'Clear cooldown message provided to customer'
    );

    // 5. Test Invalid OTP Submission
    console.log('\n--- 6. Submit Incorrect OTP ---');
    const badOtpRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: '000000',
        newPassword: updatedPassword,
      }),
    });
    const badOtpJson = await badOtpRes.json();
    assert(badOtpRes.status === 400, 'Incorrect OTP rejected with HTTP 400 Bad Request');
    assert(
      badOtpJson.message.includes('Invalid verification code. 4 attempt(s) remaining'),
      'Displays remaining attempt count (4 attempts left)'
    );

    // Check database incremented attempt
    const recordAfterBad = await PasswordResetOtpModel.findById(otpRecord?._id);
    assert(recordAfterBad?.attempts === 1, 'Database attempt counter incremented to 1');

    // 6. Test Exceeding Maximum Verification Attempts (5 attempts)
    console.log('\n--- 7. Exceed Maximum Verification Attempts (5 Attempts Lockout) ---');
    for (let i = 2; i <= 5; i++) {
      await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          otp: '111111',
          newPassword: updatedPassword,
        }),
      });
    }

    // Try a 6th attempt (even with the correct OTP now)
    const lockedRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: sentOtp,
        newPassword: updatedPassword,
      }),
    });
    const lockedJson = await lockedRes.json();
    assert(lockedRes.status === 400, 'Locked OTP rejects verification with HTTP 400');
    assert(
      lockedJson.message.includes('Maximum verification attempts exceeded') ||
      lockedJson.message.includes('Invalid or expired verification code'),
      'Informs user that maximum attempts were exceeded'
    );

    // 7. Test Expired OTP
    console.log('\n--- 8. Expired OTP Protection ---');
    // Simulate an expired OTP
    await PasswordResetOtpModel.deleteMany({ email: testEmail });
    await PasswordResetOtpModel.create({
      email: testEmail,
      otpHash: otpRecord?.otpHash,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      attempts: 0,
      maxAttempts: 5,
      isUsed: false,
      lastResendAt: new Date(Date.now() - 70000), // > 60s ago
    });

    const expiredRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: sentOtp,
        newPassword: updatedPassword,
      }),
    });
    const expiredJson = await expiredRes.json();
    assert(expiredRes.status === 400, 'Expired OTP rejected with HTTP 400');
    assert(
      expiredJson.message.includes('expired'),
      'Informs user that verification code has expired'
    );

    // 8. Resend OTP After Cooldown & Successful Password Reset
    console.log('\n--- 9. Resend Fresh OTP and Successfully Reset Password ---');
    // Clear old expired record so resend cooldown is satisfied
    await PasswordResetOtpModel.deleteMany({ email: testEmail });

    const freshForgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    assert(freshForgotRes.status === 200, 'Fresh OTP request succeeded after cooldown');

    const freshOtp = getTestOtp(testEmail);
    assert(Boolean(freshOtp), 'New fresh OTP generated');

    const resetSuccessRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: freshOtp,
        newPassword: updatedPassword,
      }),
    });
    const resetSuccessJson = await resetSuccessRes.json();
    assert(resetSuccessRes.status === 200, 'Password reset succeeded with HTTP 200');
    assert(
      resetSuccessJson.message.includes('Password has been reset successfully'),
      'Success message instructs customer to log in with new password'
    );

    // 9. One-time OTP: Try reusing the already-used OTP
    console.log('\n--- 10. Replay Attack Prevention (Reusing Used OTP) ---');
    const reuseRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: freshOtp,
        newPassword: 'AnotherPassword999!',
      }),
    });
    assert(reuseRes.status === 400, 'Reusing previously redeemed OTP rejected with HTTP 400');

    // 10. Verify Old Password No Longer Works
    console.log('\n--- 11. Old Password Invalidation ---');
    const oldLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: originalPassword }),
    });
    assert(oldLoginRes.status === 401, 'Login with old password rejected with HTTP 401');

    // 11. Verify New Password Logs In Successfully
    console.log('\n--- 12. Login with New Password ---');
    const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: updatedPassword }),
    });
    const newLoginJson = await newLoginRes.json();
    assert(newLoginRes.status === 200, 'Login with new password succeeded with HTTP 200');
    assert(Boolean(newLoginJson.data?.accessToken), 'Valid JWT accessToken received with new password');

    // 12. Regression: Verify Standard Customer Registration Still Works
    console.log('\n--- 13. Regression: Standard Customer Registration & Login ---');
    const regEmail = `reg_test_${Date.now()}@stridex.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Standard New User',
        email: regEmail,
        password: 'StandardPassword123!',
        phone: '0712345678',
      }),
    });
    const regJson = await regRes.json();
    assert(regRes.status === 201, 'Standard user registration functions properly (HTTP 201)');
    assert(Boolean(regJson.data?.accessToken), 'Access token returned on registration');

    // Clean up test data
    await UserModel.deleteOne({ email: testEmail });
    await UserModel.deleteOne({ email: regEmail });
    await PasswordResetOtpModel.deleteMany({ email: testEmail });

    console.log('\n========================================================================');
    console.log(`📊 FORGOT PASSWORD & OTP TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('========================================================================');

    server.close();
    await mongoose.disconnect();

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Test execution error:', err);
    server.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

runForgotPasswordTests();
