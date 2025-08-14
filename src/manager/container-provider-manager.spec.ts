/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/
import { afterEach, beforeEach, describe, expect, test, vi, it } from 'vitest';
import { Container, injectFromBase, injectable, postConstruct, preDestroy } from 'inversify';
import { AuthenticationProviderManager } from './container-provider-manager';
import { ExtensionContextSymbol, TelemetryLoggerSymbol } from '../inject/symbol';
import {
  type AuthenticationProviderAuthenticationSessionsChangeEvent,
  type AuthenticationSession,
  type EventEmitter,
  type ExtensionContext,
  type TelemetryLogger,
  type TelemetryTrustedValue,
  authentication,
  window,
} from '@podman-desktop/api';
import { PasscodeEndpointHelper } from '../helper/passcode-endpoint-helper';
import { IamSessionConverterHelper } from '../helper/iam-session-converter-helper';
import { PersistentSessionHelper } from '../helper/persistent-session-helper';
import { IamSessionRefreshTokenHelper } from '../helper/iam-session-refresh-token-helper';
import type { IAMSession } from '../api/iam-session';
import { AccountSelectHelper } from '/@/helper/account-select-helper';
import type { CloudAccount } from '../api/cloud-account';

vi.mock(import('node:path'));
vi.mock(import('/@/helper/account-select-helper'));
vi.mock(import('/@/helper/passcode-endpoint-helper'));
vi.mock(import('/@/helper/iam-session-converter-helper'));
vi.mock(import('/@/helper/persistent-session-helper'));
vi.mock(import('/@/helper/iam-session-refresh-token-helper'));
vi.useFakeTimers();

let authenticationProviderManager: TestAuthenticationProviderManager;

const telemetryLoggerMock = {
  logUsage: vi.fn<(eventName: string, data?: Record<string, unknown | TelemetryTrustedValue>) => void>(),
} as unknown as TelemetryLogger;

const extensionContextMock: ExtensionContext = {
  subscriptions: [],
} as unknown as ExtensionContext;

@injectable()
@injectFromBase()
class TestAuthenticationProviderManager extends AuthenticationProviderManager {
  // Call the parent postConstruct from the parent class
  @postConstruct()
  public async postConstruct(): Promise<void> {
    await super.init();
  }

  // Call the parent preDestroy from the parent class
  @preDestroy()
  public async preDestroy(): Promise<void> {
    await super.dispose();
  }

  async monitorTokens(): Promise<void> {
    return super.monitorTokens();
  }

  getCheckTimeout(): NodeJS.Timeout | undefined {
    return this.checkTimeout;
  }

  getIamSessions(): IAMSession[] {
    return this.iamSessions;
  }

  getOnDidChangeSessions(): EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this._onDidChangeSessions;
  }

  async createSession(_scopes: string[]): Promise<AuthenticationSession> {
    return super.createSession(_scopes);
  }
}

// Create fresh instance each time
const container = new Container();

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetAllMocks();

  vi.spyOn(console, 'error').mockImplementation(() => {});

  container.bind(TelemetryLoggerSymbol).toConstantValue(telemetryLoggerMock);
  container.bind(ExtensionContextSymbol).toConstantValue(extensionContextMock);
  container.bind<AccountSelectHelper>(AccountSelectHelper).toSelf().inSingletonScope();
  container.bind<PasscodeEndpointHelper>(PasscodeEndpointHelper).toSelf().inSingletonScope();
  container.bind<IamSessionConverterHelper>(IamSessionConverterHelper).toSelf().inSingletonScope();
  container.bind<PersistentSessionHelper>(PersistentSessionHelper).toSelf().inSingletonScope();
  container.bind<IamSessionRefreshTokenHelper>(IamSessionRefreshTokenHelper).toSelf().inSingletonScope();

  container.bind(TestAuthenticationProviderManager).toSelf();

  // Empty sessions by default
  vi.mocked(PersistentSessionHelper.prototype.restoreSessions).mockResolvedValue([]);

  authenticationProviderManager = await container.getAsync<TestAuthenticationProviderManager>(
    TestAuthenticationProviderManager,
  );
});

afterEach(async () => {
  // Clear all timers
  vi.clearAllTimers();

  await container.unbindAll();
});

describe('init/post construct', () => {
  it('should check postconstruct is performed', () => {
    expect.assertions(3);
    expect(PersistentSessionHelper.prototype.restoreSessions).toHaveBeenCalledWith();
    expect(PersistentSessionHelper.prototype.save).toHaveBeenCalledWith(expect.any(Array));

    expect(authenticationProviderManager).toBeInstanceOf(TestAuthenticationProviderManager);
  });

  it('should have a setInterval checking tokens', () => {
    expect.assertions(1);

    const monitorTokensSpy = vi.spyOn(authenticationProviderManager, 'monitorTokens');

    monitorTokensSpy.mockClear();
    // Change timer
    vi.advanceTimersByTime(130 * 1_000);

    expect(monitorTokensSpy).toHaveBeenCalledTimes(2);
  });

  it('handle error from monitor Tokens', async () => {
    expect.assertions(3);

    const monitorTokensSpy = vi.spyOn(authenticationProviderManager, 'monitorTokens');

    monitorTokensSpy.mockRejectedValue(new Error('test error while monitoring tokens'));

    monitorTokensSpy.mockClear();
    // Change timer
    vi.advanceTimersByTime(130 * 1_000);

    expect(monitorTokensSpy).toHaveBeenCalledWith();

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error monitoring tokens', expect.any(Error));
    });
  });

  it('should handle error during initial monitorTokens in init()', async () => {
    expect.assertions(2);

    // Spy and force monitorTokens to throw on first call
    const monitorTokensSpy = vi
      .spyOn(authenticationProviderManager, 'monitorTokens')
      .mockRejectedValueOnce(new Error('Initial monitor failure'));

    // Call postConstruct
    await authenticationProviderManager.postConstruct();

    // Should call monitorTokens and handle the error
    expect(monitorTokensSpy).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Error while the initial monitoring of tokens', expect.any(Error));
  });
});

test('destroy', async () => {
  expect.assertions(3);

  // Change timer
  vi.advanceTimersByTime(60 * 1_000);

  await vi.waitFor(() => {
    expect(authenticationProviderManager.getCheckTimeout()).toBeDefined();
  });

  // Check we called the dispose method
  await authenticationProviderManager.preDestroy();

  expect(authenticationProviderManager.getCheckTimeout()).toBeUndefined();

  expect(PersistentSessionHelper.prototype.save).toHaveBeenCalledWith(expect.any(Array));
});

describe('createSession', async () => {
  it('create session without accounts', async () => {
    expect.assertions(5);

    const dummyIamSession: IAMSession = {
      session_id: '123id',
    } as unknown as IAMSession;

    const podmanDesktopSession: AuthenticationSession = {} as unknown as AuthenticationSession;

    const onDidChangeSessions = authenticationProviderManager.getOnDidChangeSessions();
    vi.mocked(PasscodeEndpointHelper.prototype.authenticate).mockResolvedValue(dummyIamSession);
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(podmanDesktopSession);
    vi.mocked(AccountSelectHelper.prototype.getAccounts).mockResolvedValue([]);

    const result = await authenticationProviderManager.createSession(['test']);

    expect(PasscodeEndpointHelper.prototype.authenticate).toHaveBeenCalledWith();
    expect(IamSessionConverterHelper.prototype.convertToAuthenticationSession).toHaveBeenCalledWith(dummyIamSession);
    expect(result).toStrictEqual(podmanDesktopSession);

    expect(authenticationProviderManager.getIamSessions()).toStrictEqual([dummyIamSession]);

    expect(onDidChangeSessions.fire).toHaveBeenCalledWith({
      added: [podmanDesktopSession],
    });
  });

  it('create session with multiple accounts', async () => {
    expect.assertions(1);

    const dummyIamSession: IAMSession = {
      session_id: '123id',
    } as unknown as IAMSession;

    const podmanDesktopSession: AuthenticationSession = {} as unknown as AuthenticationSession;

    vi.mocked(PasscodeEndpointHelper.prototype.authenticate).mockResolvedValue(dummyIamSession);
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(podmanDesktopSession);
    const account1 = {
      guid: 'test-guid',
      name: 'test-name',
      ibmid: 'test-ibmid',
    };
    vi.mocked(AccountSelectHelper.prototype.getAccounts).mockResolvedValue([
      account1,
      {
        guid: 'test-guid-2',
        name: 'test-name-2',
        ibmid: 'test-ibmid-2',
      },
    ]);

    // Mock showQuickPick to return the first account
    vi.mocked(window.showQuickPick<{ label: string; description: string; data: CloudAccount }>).mockResolvedValue({
      label: 'test-name',
      description: 'test-guid',
      data: account1,
    });

    await authenticationProviderManager.createSession(['test']);

    expect(IamSessionRefreshTokenHelper.prototype.refreshToken).toHaveBeenCalledWith(dummyIamSession, account1);
  });

  it('create session with multiple accounts and no selecting account', async () => {
    expect.assertions(2);

    const dummyIamSession: IAMSession = {
      session_id: '123id',
    } as unknown as IAMSession;

    const podmanDesktopSession: AuthenticationSession = {} as unknown as AuthenticationSession;

    vi.mocked(PasscodeEndpointHelper.prototype.authenticate).mockResolvedValue(dummyIamSession);
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(podmanDesktopSession);
    const account1 = {
      guid: 'test-guid',
      name: 'test-name',
      ibmid: 'test-ibmid',
    };
    vi.mocked(AccountSelectHelper.prototype.getAccounts).mockResolvedValue([
      account1,
      {
        guid: 'test-guid-2',
        name: 'test-name-2',
        ibmid: 'test-ibmid-2',
      },
    ]);

    // Mock showQuickPick to return the first account
    vi.mocked(window.showQuickPick<{ label: string; description: string; data: CloudAccount }>).mockResolvedValue(
      undefined,
    );

    await expect(() => authenticationProviderManager.createSession(['test'])).rejects.toThrow('No account selected');

    expect(IamSessionRefreshTokenHelper.prototype.refreshToken).not.toHaveBeenCalled();
  });
});

describe('getSessions', () => {
  it('getSessions should return empty array when no sessions', async () => {
    expect.assertions(1);

    const sessions = await authenticationProviderManager.getSessions();

    expect(sessions).toHaveLength(0);
  });

  it('getSessions should return sessions', async () => {
    expect.assertions(2);

    const dummyIamSession: IAMSession = {
      session_id: '123id',
    } as unknown as IAMSession;
    const podmanDesktopSession: AuthenticationSession = {} as unknown as AuthenticationSession;

    authenticationProviderManager.getIamSessions().push(dummyIamSession);
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(podmanDesktopSession);

    const sessions = await authenticationProviderManager.getSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toStrictEqual(podmanDesktopSession);
  });

  it('getSessions should return sessions with scopes', async () => {
    expect.assertions(2);

    const dummyIamSession: IAMSession = {
      session_id: '123id',
      scope: 'test',
    } as unknown as IAMSession;

    const podmanDesktopSession: AuthenticationSession = {} as unknown as AuthenticationSession;

    authenticationProviderManager.getIamSessions().push(dummyIamSession);
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(podmanDesktopSession);

    const sessions = await authenticationProviderManager.getSessions(['test']);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toStrictEqual(podmanDesktopSession);
  });
});

describe('removeSession', () => {
  it('should remove session and fire event', async () => {
    expect.assertions(3);

    authenticationProviderManager
      .getIamSessions()
      .push({ session_id: 'abc123' } as unknown as IAMSession, { session_id: 'def456' } as unknown as IAMSession);

    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockImplementation(
      (session: IAMSession) => ({ id: session.session_id }) as unknown as AuthenticationSession,
    );

    await authenticationProviderManager.removeSession('abc123');

    expect(authenticationProviderManager.getIamSessions()).toHaveLength(1);
    expect(authenticationProviderManager.getIamSessions()[0].session_id).toBe('def456');

    expect(authenticationProviderManager.getOnDidChangeSessions().fire).toHaveBeenCalledWith({
      removed: [{ id: 'abc123' }],
    });
  });

  it('should throw error if session not found', async () => {
    expect.assertions(3);

    authenticationProviderManager
      .getIamSessions()
      .push({ session_id: 'abc123' } as unknown as IAMSession, { session_id: 'def456' } as unknown as IAMSession);

    await expect(authenticationProviderManager.removeSession('nonexistent')).rejects.toThrow(
      'Session with id nonexistent not found',
    );

    expect(authenticationProviderManager.getIamSessions()).toHaveLength(2);
    expect(authenticationProviderManager.getOnDidChangeSessions().fire).not.toHaveBeenCalled();
  });
});

test('should register authentication provider and push disposable to subscriptions', async () => {
  expect.assertions(2);

  const mockDisposable = { dispose: vi.fn<() => void>() };
  vi.mocked(authentication.registerAuthenticationProvider).mockReturnValue(mockDisposable);

  await authenticationProviderManager.registerAuthenticationProvider();

  expect(authentication.registerAuthenticationProvider).toHaveBeenCalledWith(
    'ibmcloud-account',
    'IBM Cloud Account',
    {
      onDidChangeSessions: authenticationProviderManager.getOnDidChangeSessions().event,
      createSession: expect.any(Function),
      getSessions: expect.any(Function),
      removeSession: expect.any(Function),
    },
    {
      images: {
        icon: 'icon.png',
      },
    },
  );
  expect(extensionContextMock.subscriptions).toContain(mockDisposable);
});

test('createSessionEntry', async () => {
  expect.assertions(1);

  vi.mocked(authentication.getSession).mockResolvedValue({ id: 'abc123' } as unknown as AuthenticationSession);

  await authenticationProviderManager.createSessionEntry();

  expect(authentication.getSession).toHaveBeenCalledWith('ibmcloud-account', ['ibm openid'], { createIfNone: false });
});

describe('monitorTokens', () => {
  it('should refresh and update sessions expiring within 60 seconds', async () => {
    expect.assertions(4);

    const now = Math.round(Date.now() / 1000);
    const expiringSession: IAMSession = { session_id: '1', expiration: now + 30 } as unknown as IAMSession;
    const refreshedSession = { session_id: '1', expiration: now + 3600 } as unknown as IAMSession;
    const convertedSession = { id: '1', label: 'refreshed' } as unknown as AuthenticationSession;

    authenticationProviderManager.getIamSessions().push(expiringSession);
    vi.mocked(IamSessionRefreshTokenHelper.prototype.refreshToken).mockResolvedValue(refreshedSession);
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(convertedSession);

    await authenticationProviderManager.monitorTokens();

    // Should have refreshed the token
    expect(IamSessionRefreshTokenHelper.prototype.refreshToken).toHaveBeenCalledWith(expiringSession);

    // Should have replaced the session
    expect(authenticationProviderManager.getIamSessions()[0]).toStrictEqual(refreshedSession);

    // Should have fired event
    expect(authenticationProviderManager.getOnDidChangeSessions().fire).toHaveBeenCalledWith({
      changed: [convertedSession],
    });

    // Should have saved sessions
    expect(PersistentSessionHelper.prototype.save).toHaveBeenCalledWith([refreshedSession]);
  });

  it('should not refresh sessions that are not expiring', async () => {
    expect.assertions(3);

    const now = Math.round(Date.now() / 1000);
    const freshSession = { session_id: '2', expiration: now + 3600 } as unknown as IAMSession;

    authenticationProviderManager.getIamSessions().push(freshSession);

    await authenticationProviderManager.monitorTokens();

    expect(IamSessionRefreshTokenHelper.prototype.refreshToken).not.toHaveBeenCalled();
    expect(authenticationProviderManager.getOnDidChangeSessions().fire).not.toHaveBeenCalled();
    expect(PersistentSessionHelper.prototype.save).toHaveBeenCalledWith([freshSession]);
  });

  it('should remove session and fire removed event on refresh error', async () => {
    expect.assertions(4);

    const now = Math.round(Date.now() / 1000);
    const expiringSession: IAMSession = { session_id: 'fail-session', expiration: now + 10 } as unknown as IAMSession;
    const convertedSession = { id: 'fail-session' } as unknown as AuthenticationSession;

    authenticationProviderManager.getIamSessions().push(expiringSession);

    vi.mocked(IamSessionRefreshTokenHelper.prototype.refreshToken).mockRejectedValue(new Error('refresh fail'));
    vi.mocked(IamSessionConverterHelper.prototype.convertToAuthenticationSession).mockReturnValue(convertedSession);

    await authenticationProviderManager.monitorTokens();

    // Should have removed session
    expect(authenticationProviderManager.getIamSessions()).toHaveLength(0);

    // Should have fired removed event
    expect(authenticationProviderManager.getOnDidChangeSessions().fire).toHaveBeenCalledWith({
      removed: [convertedSession],
    });

    // Should have saved sessions (empty)
    expect(PersistentSessionHelper.prototype.save).toHaveBeenCalledWith([]);

    // Should log error
    expect(console.error).toHaveBeenCalledWith('Error refreshing token', expect.any(Error));
  });
});
