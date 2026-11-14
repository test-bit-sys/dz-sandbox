import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
  type SandboxContext,
} from '@dz-sandbox/core';
import { createBaridiMobServer } from './server.js';
import { BARIDIMOB_SPEC } from './baridimob.spec.js';

describe('@dz-sandbox/mock-baridimob server', () => {
  let ctx: SandboxContext;
  let server: ReturnType<typeof createBaridiMobServer>;
  let baseUrl: string;

  beforeAll(async () => {
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(42);
    const scenarios = new ScenarioEngine(store);
    ctx = { store, clock, rng, scenarios, timeoutMs: 500 };

    server = createBaridiMobServer({ ctx });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('serves health check with honesty status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const json = (await res.json()) as { status: string; service: string };
    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.service).toBe('mock-baridimob');
  });

  it('handles login happy path and credential failure modes', async () => {
    // 1. Happy path login
    const resOk = await fetch(`${baseUrl}/mobilebank/service/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: '0079999901', pwd: 'valid_password' }).toString(),
    });
    const okJson = (await resOk.json()) as { result: number };
    expect(okJson.result).toBe(BARIDIMOB_SPEC.resultCodes.success);

    // 2. Wrong password
    const resWrong = await fetch(`${baseUrl}/mobilebank/service/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: '0079999901', pwd: 'wrong' }).toString(),
    });
    const wrongJson = (await resWrong.json()) as { result: number };
    expect(wrongJson.result).toBe(BARIDIMOB_SPEC.resultCodes.invalidLoginPass);

    // 3. Needs hash response
    const resNeedsHash = await fetch(`${baseUrl}/mobilebank/service/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: '0079999901', pwd: 'needs_hash' }).toString(),
    });
    const hashJson = (await resNeedsHash.json()) as { result: number };
    expect(hashJson.result).toBe(BARIDIMOB_SPEC.resultCodes.hashedPasswordError);

    // 4. Login under account_locked scenario
    const resLocked = await fetch(`${baseUrl}/mobilebank/service/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'account_locked',
      },
      body: new URLSearchParams({ name: '0079999901', pwd: 'valid' }).toString(),
    });
    const lockedJson = (await resLocked.json()) as { result: number };
    expect(lockedJson.result).toBe(BARIDIMOB_SPEC.resultCodes.accountLocked);

    // 5. Login under device_confirm_required scenario
    const resConfirmReq = await fetch(`${baseUrl}/mobilebank/service/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'device_confirm_required',
      },
      body: new URLSearchParams({ name: '0079999901', pwd: 'valid' }).toString(),
    });
    const confirmReqJson = (await resConfirmReq.json()) as { result: number };
    expect(confirmReqJson.result).toBe(BARIDIMOB_SPEC.resultCodes.deviceConfirmRequired);
  });

  it('handles device confirmation and OTP scenarios', async () => {
    // 1. deviceAttach
    const resAttach = await fetch(`${baseUrl}/mobilebank/service/deviceAttach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ devid: 'dev_1', devkey: 'key_1' }).toString(),
    });
    const attachJson = (await resAttach.json()) as { result: number };
    expect(attachJson.result).toBe(0);

    // 2. deviceConfirm happy path with default OTP
    const resConfirm = await fetch(`${baseUrl}/mobilebank/service/deviceConfirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ devcode: BARIDIMOB_SPEC.defaultOtp }).toString(),
    });
    const confirmJson = (await resConfirm.json()) as { result: number };
    expect(confirmJson.result).toBe(0);

    // 3. deviceConfirm with invalid OTP
    const resBadOtp = await fetch(`${baseUrl}/mobilebank/service/deviceConfirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ devcode: '000000' }).toString(),
    });
    const badOtpJson = (await resBadOtp.json()) as { result: number };
    expect(badOtpJson.result).toBe(BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode);

    // 4. deviceConfirm with expired_otp scenario
    const resExpOtp = await fetch(`${baseUrl}/mobilebank/service/deviceConfirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'expired_otp',
      },
      body: new URLSearchParams({ devcode: BARIDIMOB_SPEC.defaultOtp }).toString(),
    });
    const expOtpJson = (await resExpOtp.json()) as { result: number };
    expect(expOtpJson.result).toBe(BARIDIMOB_SPEC.resultCodes.expiredConfirmationCode);

    // 5. deviceConfirm with too_many_attempts scenario
    const resTooMany = await fetch(`${baseUrl}/mobilebank/service/deviceConfirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'too_many_attempts',
      },
      body: new URLSearchParams({ devcode: BARIDIMOB_SPEC.defaultOtp }).toString(),
    });
    const tooManyJson = (await resTooMany.json()) as { result: number };
    expect(tooManyJson.result).toBe(BARIDIMOB_SPEC.resultCodes.tooManyConfirmationAttempts);
  });

  it('serves accounts, cards, limits, and logout', async () => {
    // accounts
    const resAccounts = await fetch(`${baseUrl}/mobilebank/service/accounts`);
    const accJson = (await resAccounts.json()) as { result: number; accounts: unknown[] };
    expect(accJson.result).toBe(0);
    expect(accJson.accounts.length).toBeGreaterThan(0);

    // single account
    const resAccount = await fetch(`${baseUrl}/mobilebank/service/account?id=00799999000000000001`);
    const singleAccJson = (await resAccount.json()) as { result: number; account: { id: string } };
    expect(singleAccJson.result).toBe(0);
    expect(singleAccJson.account.id).toBe('00799999000000000001');

    // cards
    const resCards = await fetch(`${baseUrl}/mobilebank/service/cards`);
    const cardsJson = (await resCards.json()) as { result: number; cards: unknown[] };
    expect(cardsJson.result).toBe(0);
    expect(cardsJson.cards.length).toBeGreaterThan(0);

    // single card
    const resCard = await fetch(`${baseUrl}/mobilebank/service/card?id=card_edahabia_01`);
    const cardJson = (await resCard.json()) as { result: number; card: { id: string } };
    expect(cardJson.result).toBe(0);
    expect(cardJson.card.id).toBe('card_edahabia_01');

    // cardLimits
    const resLimits = await fetch(`${baseUrl}/mobilebank/service/cardLimits?card=card_edahabia_01`);
    const limitsJson = (await resLimits.json()) as { result: number; limits: unknown[] };
    expect(limitsJson.result).toBe(0);
    expect(limitsJson.limits.length).toBeGreaterThan(0);

    // logout
    const resLogout = await fetch(`${baseUrl}/mobilebank/service/logout`);
    const logoutJson = (await resLogout.json()) as { result: number };
    expect(logoutJson.result).toBe(0);
  });

  it('executes transfers and appends to transaction history', async () => {
    // 1. Initial history check
    const resInitialHistory = await fetch(`${baseUrl}/mobilebank/service/accountHistory`);
    const initialJson = (await resInitialHistory.json()) as { result: number; history: unknown[] };
    const initialCount = initialJson.history.length;

    // 2. transferCheck happy path
    const resCheck = await fetch(`${baseUrl}/mobilebank/service/transferCheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        amount: '5000',
        currency: 'DZD',
        sourceId: '00799999000000000001',
        targetId: '00799999000000000002',
      }).toString(),
    });
    const checkJson = (await resCheck.json()) as { result: number; transRef: string };
    expect(checkJson.result).toBe(0);
    expect(checkJson.transRef).toBeDefined();

    // 3. getOTPbySMS
    const resOtp = await fetch(`${baseUrl}/mobilebank/service/getOTPbySMS?transRef=${checkJson.transRef}`);
    const otpJson = (await resOtp.json()) as { result: number };
    expect(otpJson.result).toBe(0);

    // 4. transferExec with invalid OTP
    const resBadExec = await fetch(`${baseUrl}/mobilebank/service/transferExec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        transRef: checkJson.transRef,
        confirmVal: '999999',
      }).toString(),
    });
    const badExecJson = (await resBadExec.json()) as { result: number };
    expect(badExecJson.result).toBe(BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode);

    // 5. transferExec happy path with valid OTP
    const resGoodExec = await fetch(`${baseUrl}/mobilebank/service/transferExec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        transRef: checkJson.transRef,
        confirmVal: BARIDIMOB_SPEC.defaultOtp,
      }).toString(),
    });
    const goodExecJson = (await resGoodExec.json()) as { result: number; status: string };
    expect(goodExecJson.result).toBe(0);
    expect(goodExecJson.status).toBe('EXECUTED');

    // 6. Verify transfer appeared in history
    const resUpdatedHistory = await fetch(`${baseUrl}/mobilebank/service/accountHistory`);
    const updatedJson = (await resUpdatedHistory.json()) as {
      result: number;
      history: Array<{ tid: string; amount: number }>;
    };
    expect(updatedJson.history.length).toBe(initialCount + 1);
    expect(updatedJson.history.some((t) => t.tid === checkJson.transRef)).toBe(true);

    // 7. transferCheck with insufficient_funds scenario
    const resDeclined = await fetch(`${baseUrl}/mobilebank/service/transferCheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'insufficient_funds',
      },
      body: new URLSearchParams({
        amount: '9999999',
        currency: 'DZD',
      }).toString(),
    });
    const declinedJson = (await resDeclined.json()) as { result: number };
    expect(declinedJson.result).toBe(BARIDIMOB_SPEC.resultCodes.transactionDeclined);
  });

  it('serves bill payments catalog and execution', async () => {
    const resCats = await fetch(`${baseUrl}/mobilebank/service/paymentCategories`);
    const catsJson = (await resCats.json()) as { result: number; categories: unknown[] };
    expect(catsJson.result).toBe(0);
    expect(catsJson.categories.length).toBeGreaterThan(0);

    const resProv = await fetch(`${baseUrl}/mobilebank/service/paymentProviders`);
    const provJson = (await resProv.json()) as { result: number; providers: unknown[] };
    expect(provJson.result).toBe(0);
    expect(provJson.providers.length).toBeGreaterThan(0);

    // paymentCheck under insufficient_funds scenario
    const resPayDeclined = await fetch(`${baseUrl}/mobilebank/service/paymentCheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'insufficient_funds',
      },
      body: new URLSearchParams({ providerId: 'mobilis', amount: '1000' }).toString(),
    });
    const payDeclinedJson = (await resPayDeclined.json()) as { result: number };
    expect(payDeclinedJson.result).toBe(BARIDIMOB_SPEC.resultCodes.transactionDeclined);

    // paymentCheck happy path
    const resPayCheck = await fetch(`${baseUrl}/mobilebank/service/paymentCheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ providerId: 'mobilis', amount: '1000' }).toString(),
    });
    const payCheckJson = (await resPayCheck.json()) as { result: number; transRef: string };
    expect(payCheckJson.result).toBe(0);

    // paymentExec with bad OTP
    const resPayBadOtp = await fetch(`${baseUrl}/mobilebank/service/paymentExec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        transRef: payCheckJson.transRef,
        confirmVal: '999999',
      }).toString(),
    });
    const payBadOtpJson = (await resPayBadOtp.json()) as { result: number };
    expect(payBadOtpJson.result).toBe(BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode);

    // paymentExec happy path
    const resPayExec = await fetch(`${baseUrl}/mobilebank/service/paymentExec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        transRef: payCheckJson.transRef,
        confirmVal: BARIDIMOB_SPEC.defaultOtp,
      }).toString(),
    });
    const payExecJson = (await resPayExec.json()) as { result: number };
    expect(payExecJson.result).toBe(0);
  });

  it('tests session_expired across endpoints and edge cases', async () => {
    // 1. login under session_expired
    const resLogin = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'session_expired',
      },
    });
    expect(((await resLogin.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // 2. deviceAttach under account_locked
    const resAttach = await fetch(`${baseUrl}/deviceAttach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'account_locked',
      },
    });
    expect(((await resAttach.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.accountLocked);

    // 3. accounts under session_expired
    const resAcc = await fetch(`${baseUrl}/accounts`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resAcc.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // 4. single account default query
    const resAccDef = await fetch(`${baseUrl}/account`);
    expect(((await resAccDef.json()) as { result: number }).result).toBe(0);

    // 5. single account with session_expired
    const resAccExp = await fetch(`${baseUrl}/account`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resAccExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // 6. accountHistory under session_expired
    const resHistExp = await fetch(`${baseUrl}/accountHistory`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resHistExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // 7. cards & card under session_expired
    const resCardsExp = await fetch(`${baseUrl}/cards`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resCardsExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    const resCardExp = await fetch(`${baseUrl}/card`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resCardExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    const resLimitsExp = await fetch(`${baseUrl}/cardLimits`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resLimitsExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // 8. transferCheck & getOTPbySMS under session_expired
    const resCheckExp = await fetch(`${baseUrl}/transferCheck`, {
      method: 'POST',
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resCheckExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    const resOtpExp = await fetch(`${baseUrl}/getOTPbySMS`, {
      headers: { 'X-DZ-Scenario': 'session_expired' },
    });
    expect(((await resOtpExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // 9. transferExec under expired_otp & too_many_attempts & insufficient_funds
    const resExecExp = await fetch(`${baseUrl}/transferExec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'expired_otp',
      },
    });
    expect(((await resExecExp.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.expiredConfirmationCode);

    const resExecTooMany = await fetch(`${baseUrl}/transferExec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'too_many_attempts',
      },
    });
    expect(((await resExecTooMany.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.tooManyConfirmationAttempts);

    const resExecFunds = await fetch(`${baseUrl}/transferExec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-DZ-Scenario': 'insufficient_funds',
      },
    });
    expect(((await resExecFunds.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.transactionDeclined);
  });

  it('handles direct paths without /mobilebank/service prefix', async () => {
    const resDirect = await fetch(`${baseUrl}/accounts`);
    const directJson = (await resDirect.json()) as { result: number };
    expect(directJson.result).toBe(0);
  });

  it('covers full branch matrix for scenarios, hash login, payments, and store scenarios', async () => {
    // 1. login/hash endpoint
    const resHash = await fetch(`${baseUrl}/mobilebank/service/login/hash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '0079999901', pwd: 'needs_hash' }),
    });
    expect(((await resHash.json()) as { result: number }).result).toBe(0);

    // 2. paymentCheck under insufficient_funds
    const resPayCheckFunds = await fetch(`${baseUrl}/mobilebank/service/paymentCheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DZ-Scenario': 'insufficient_funds',
      },
      body: JSON.stringify({ amount: 1000000 }),
    });
    expect(((await resPayCheckFunds.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.transactionDeclined);

    // 3. paymentExec under invalid_otp scenario
    const resPayExecInvalid = await fetch(`${baseUrl}/mobilebank/service/paymentExec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DZ-Scenario': 'invalid_otp',
      },
      body: JSON.stringify({ transRef: 'PAY_123', confirmVal: BARIDIMOB_SPEC.defaultOtp }),
    });
    expect(((await resPayExecInvalid.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode);

    // 4. Provider default scenario via ctx.scenarios
    ctx.scenarios.setDefault('baridimob', 'session_expired');
    const resProviderDefault = await fetch(`${baseUrl}/mobilebank/service/cards`);
    expect(((await resProviderDefault.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.sessionClosed);

    // Reset default back to success
    ctx.scenarios.setDefault('baridimob', 'success');
    const resReset = await fetch(`${baseUrl}/mobilebank/service/cards`);
    expect(((await resReset.json()) as { result: number }).result).toBe(0);

    // 5. Resource-bound scenario resolution
    ctx.scenarios.setResourceScenario('baridimob', 'TR_RESOURCE_TEST', 'expired_otp');
    const resResource = await fetch(`${baseUrl}/mobilebank/service/transferExec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transRef: 'TR_RESOURCE_TEST', confirmVal: BARIDIMOB_SPEC.defaultOtp }),
    });
    expect(((await resResource.json()) as { result: number }).result).toBe(BARIDIMOB_SPEC.resultCodes.expiredConfirmationCode);

    // 6. Network fault scenarios (gateway_500, rate_limited)
    const res500 = await fetch(`${baseUrl}/mobilebank/service/accounts`, {
      headers: { 'X-DZ-Scenario': 'gateway_500' },
    });
    expect(res500.status).toBe(500);

    const res429 = await fetch(`${baseUrl}/mobilebank/service/accounts`, {
      headers: { 'X-DZ-Scenario': 'rate_limited' },
    });
    expect(res429.status).toBe(429);

    // 7. transferExec without pending transaction in store (uses fallback defaults)
    const resDirectExec = await fetch(`${baseUrl}/mobilebank/service/transferExec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transRef: 'TR_FALLBACK_' + Date.now(),
        confirmVal: BARIDIMOB_SPEC.defaultOtp,
      }),
    });
    expect(((await resDirectExec.json()) as { result: number }).result).toBe(0);
  });
});
