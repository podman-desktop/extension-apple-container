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
import { afterEach, beforeEach, describe, expect, vi, it } from 'vitest';
import { Container } from 'inversify';
import { ExtensionContextSymbol, TelemetryLoggerSymbol } from '../inject/symbol';
import {
  type ContainerProviderConnection,
  type ExtensionContext,
  type Logger,
  type Provider,
  type TelemetryLogger,
  type TelemetryTrustedValue,
  process,
  provider,
  window,
} from '@podman-desktop/api';
import { ContainerProviderManager } from './container-provider-manager';
import { resolve } from 'node:path';
import { type ChildProcess, spawn } from 'node:child_process';
import socktainerVersions from '../../socktainer-versions.json';

vi.mock(import('node:path'));
vi.mock(import('node:child_process'));
vi.useFakeTimers();

const telemetryLoggerMock = {
  logUsage: vi.fn<(eventName: string, data?: Record<string, unknown | TelemetryTrustedValue>) => void>(),
} as unknown as TelemetryLogger;

const extensionContextMock: ExtensionContext = {
  subscriptions: [],
} as unknown as ExtensionContext;

let containerProviderManager: ContainerProviderManager;

// Create fresh instance each time
const container = new Container();

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetAllMocks();

  vi.spyOn(console, 'error').mockImplementation(() => {});

  container.bind(TelemetryLoggerSymbol).toConstantValue(telemetryLoggerMock);
  container.bind(ExtensionContextSymbol).toConstantValue(extensionContextMock);
  container.bind(ContainerProviderManager).toSelf();

  containerProviderManager = await container.getAsync<ContainerProviderManager>(ContainerProviderManager);
});

afterEach(async () => {
  // Clear all timers
  vi.clearAllTimers();

  await container.unbindAllAsync();
});

describe('init/post construct', () => {
  it('should check postconstruct is performed', () => {
    expect.assertions(1);

    expect(containerProviderManager).toBeInstanceOf(ContainerProviderManager);
  });
});

describe('registerContainerProvider', () => {
  it('should describe how to get a connection when there is none', async () => {
    expect.assertions(3);

    vi.mocked(provider.createProvider).mockReturnValue({} as unknown as Provider);
    vi.spyOn(containerProviderManager, 'monitorContainerSystemStatus').mockResolvedValue();

    await containerProviderManager.registerContainerProvider();

    const description = vi.mocked(provider.createProvider).mock.calls[0]?.[0].emptyConnectionMarkdownDescription;

    expect(description).toContain(`supported versions: ${Object.keys(socktainerVersions).join(', ')}`);
    expect(description).toContain('`container system start`');
    expect(description).toContain('(https://github.com/podman-desktop/extension-apple-container#readme)');
  });
});

describe('updateContainerSystemStatus', () => {
  const providerMock = {
    updateStatus: vi.fn<Provider['updateStatus']>(),
    registerContainerProviderConnection: vi.fn<Provider['registerContainerProviderConnection']>(),
  } as unknown as Provider;

  beforeEach(() => {
    vi.mocked(window.showErrorMessage).mockResolvedValue(undefined);
    vi.mocked(spawn).mockReturnValue({ on: vi.fn<ChildProcess['on']>() } as unknown as ChildProcess);
    vi.spyOn(containerProviderManager, 'timeout').mockResolvedValue();
  });

  function getRegisteredConnection(): ContainerProviderConnection {
    const connection = vi.mocked(providerMock).registerContainerProviderConnection.mock.lastCall?.[0];
    if (!connection) {
      throw new Error('no connection registered');
    }
    return connection;
  }

  function mockContainerVersion(version: string): void {
    vi.mocked(process.exec).mockImplementation(async (_cmd, args) => ({
      command: '',
      stderr: '',
      stdout: args?.[1] === '--version' ? `container CLI version ${version} (build: release, commit: d265d66)` : '',
    }));
  }

  it('should launch the socktainer matching the container minor version', async () => {
    expect.assertions(2);

    mockContainerVersion('1.4.2');
    vi.mocked(resolve).mockReturnValue('/ext/bin/1.4/socktainer');

    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(resolve).toHaveBeenCalledWith(expect.anything(), '..', 'dist', 'bin', '1.4', 'socktainer');
    expect(spawn).toHaveBeenCalledWith('/ext/bin/1.4/socktainer');
  });

  it('should restart socktainer when the container minor version changes', async () => {
    expect.assertions(3);

    const firstProcess = {
      on: vi.fn<ChildProcess['on']>(),
      kill: vi.fn<ChildProcess['kill']>(),
    } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValueOnce(firstProcess);
    vi.mocked(resolve).mockImplementation((...paths: string[]) => paths.join('/'));

    mockContainerVersion('1.4.2');
    await containerProviderManager.updateContainerSystemStatus(providerMock);
    mockContainerVersion('1.5.0');
    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(firstProcess.kill).toHaveBeenCalledExactlyOnceWith();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith(expect.stringContaining('/1.5/socktainer'));
  });

  it('should keep the ready status once socktainer is already started', async () => {
    expect.assertions(1);

    mockContainerVersion('1.4.2');

    await containerProviderManager.updateContainerSystemStatus(providerMock);
    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(providerMock.updateStatus).toHaveBeenLastCalledWith('ready');
  });

  // Returns a function emitting an event to the listener registered on the spawned socktainer process
  function mockSocktainerProcess(): (event: string, ...args: unknown[]) => void {
    const on = vi.fn<ChildProcess['on']>();
    vi.mocked(spawn).mockReturnValueOnce({ on, kill: vi.fn<ChildProcess['kill']>() } as unknown as ChildProcess);
    return (event, ...args): void => {
      const listener = on.mock.calls.find(([name]) => name === event)?.[1];
      (listener as (...listenerArgs: unknown[]) => void)(...args);
    };
  }

  it('should log socktainer spawn errors instead of leaving them unhandled', async () => {
    expect.assertions(1);

    mockContainerVersion('1.4.2');
    const emitSocktainerEvent = mockSocktainerProcess();

    await containerProviderManager.updateContainerSystemStatus(providerMock);
    const error = new Error('spawn socktainer ENOENT');
    emitSocktainerEvent('error', error);

    expect(console.error).toHaveBeenCalledWith('Error running socktainer', error);
  });

  it('should restart socktainer on the next check when it exited', async () => {
    expect.assertions(4);

    mockContainerVersion('1.4.2');
    vi.mocked(providerMock.registerContainerProviderConnection).mockReturnValue({ dispose: vi.fn<() => void>() });
    const emitSocktainerEvent = mockSocktainerProcess();
    mockSocktainerProcess();

    await containerProviderManager.updateContainerSystemStatus(providerMock);
    emitSocktainerEvent('close', 1);

    expect(getRegisteredConnection().status()).toBe('stopped');

    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(getRegisteredConnection().status()).toBe('started');
    expect(providerMock.registerContainerProviderConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'Apple' }),
    );
  });

  it('should keep the connection started when a replaced socktainer exits', async () => {
    expect.assertions(2);

    const connectionDisposable = { dispose: vi.fn<() => void>() };
    vi.mocked(providerMock.registerContainerProviderConnection).mockReturnValue(connectionDisposable);
    const emitFirstSocktainerEvent = mockSocktainerProcess();
    mockSocktainerProcess();

    mockContainerVersion('1.4.2');
    await containerProviderManager.updateContainerSystemStatus(providerMock);
    mockContainerVersion('1.5.0');
    await containerProviderManager.updateContainerSystemStatus(providerMock);
    // The first socktainer was killed when the container version changed
    emitFirstSocktainerEvent('close', 0);

    expect(connectionDisposable.dispose).not.toHaveBeenCalled();
    expect(getRegisteredConnection().status()).toBe('started');
  });

  it('should not report the connection as started when socktainer exits while starting', async () => {
    expect.assertions(2);

    mockContainerVersion('1.4.2');
    const emitSocktainerEvent = mockSocktainerProcess();
    vi.mocked(containerProviderManager.timeout).mockImplementation(async () => {
      emitSocktainerEvent('close', 1);
    });

    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(getRegisteredConnection().status()).toBe('stopped');
    expect(telemetryLoggerMock.logUsage).not.toHaveBeenCalled();
  });

  it('should report not-installed when the container CLI is missing', async () => {
    expect.assertions(1);

    vi.mocked(process.exec).mockRejectedValue(new Error('not found'));

    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(providerMock.updateStatus).toHaveBeenLastCalledWith('not-installed');
  });

  it('should log a missing container CLI only once', async () => {
    expect.assertions(1);

    const statefulProvider = {
      status: 'unknown',
      updateStatus: vi.fn<Provider['updateStatus']>(function (this: { status: string }, status) {
        this.status = status;
      }),
    } as unknown as Provider;
    vi.mocked(process.exec).mockRejectedValue(new Error('not found'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await containerProviderManager.updateContainerSystemStatus(statefulProvider);
    await containerProviderManager.updateContainerSystemStatus(statefulProvider);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('should add the Homebrew and default install folders to the PATH of the container CLI', async () => {
    expect.assertions(1);

    mockContainerVersion('1.4.2');

    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(process.exec).toHaveBeenCalledWith('container', ['system', '--version'], {
      env: { PATH: expect.stringMatching(/\/usr\/local\/bin:\/opt\/homebrew\/bin/) },
    });
  });

  it('should report an unsupported container version only once', async () => {
    expect.assertions(3);

    mockContainerVersion('1.2.0');

    await containerProviderManager.updateContainerSystemStatus(providerMock);
    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(providerMock.updateStatus).toHaveBeenLastCalledWith('error');
    expect(spawn).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('1.2.0'));
  });

  it('should unregister the connection when the container CLI is removed', async () => {
    expect.assertions(2);

    const connectionDisposable = { dispose: vi.fn<() => void>() };
    vi.mocked(providerMock.registerContainerProviderConnection).mockReturnValue(connectionDisposable);
    vi.mocked(spawn).mockReturnValue({
      on: vi.fn<ChildProcess['on']>(),
      kill: vi.fn<ChildProcess['kill']>(),
    } as unknown as ChildProcess);

    mockContainerVersion('1.4.2');
    await containerProviderManager.updateContainerSystemStatus(providerMock);
    vi.mocked(process.exec).mockRejectedValue(new Error('not found'));
    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(connectionDisposable.dispose).toHaveBeenCalledExactlyOnceWith();
    expect(getRegisteredConnection().status()).toBe('stopped');
  });

  describe('start and stop of the container system', () => {
    const logger: Logger = {
      log: vi.fn<Logger['log']>(),
      error: vi.fn<Logger['error']>(),
      warn: vi.fn<Logger['warn']>(),
    };

    let systemRunning: boolean;

    beforeEach(() => {
      systemRunning = false;
      vi.mocked(providerMock.registerContainerProviderConnection).mockReturnValue({ dispose: vi.fn<() => void>() });
      vi.mocked(spawn).mockReturnValue({
        on: vi.fn<ChildProcess['on']>(),
        kill: vi.fn<ChildProcess['kill']>(),
      } as unknown as ChildProcess);
      // 'container system start/stop' change the state reported by 'container system status'
      vi.mocked(process.exec).mockImplementation(async (_cmd, args) => {
        if (args?.[1] === 'start') {
          systemRunning = true;
        } else if (args?.[1] === 'stop') {
          systemRunning = false;
        } else if (args?.[1] === 'status' && !systemRunning) {
          throw new Error('apiserver is not running');
        }
        const stdout = args?.[1] === '--version' ? 'container CLI version 1.4.2 (build: release, commit: d265d66)' : '';
        return { command: '', stderr: '', stdout };
      });
    });

    it('should register a stopped connection with start and stop actions when the system is not running', async () => {
      expect.assertions(5);

      await containerProviderManager.updateContainerSystemStatus(providerMock);

      const connection = getRegisteredConnection();

      expect(connection.status()).toBe('stopped');
      expect(connection.lifecycle?.start).toBeDefined();
      expect(connection.lifecycle?.stop).toBeDefined();
      expect(spawn).not.toHaveBeenCalled();
      expect(providerMock.updateStatus).toHaveBeenLastCalledWith('stopped');
    });

    it('should start the container system and socktainer from the connection', async () => {
      expect.assertions(5);

      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      await connection.lifecycle?.start?.({ log: logger }, logger);

      expect(process.exec).toHaveBeenCalledWith('container', ['system', 'start', '--enable-kernel-install'], {
        env: { PATH: expect.any(String) },
        logger,
      });
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(connection.status()).toBe('started');
      expect(providerMock.updateStatus).toHaveBeenLastCalledWith('ready');
      expect(providerMock.registerContainerProviderConnection).toHaveBeenCalledExactlyOnceWith(connection);
    });

    it('should report the starting status while the container system starts', async () => {
      expect.assertions(3);

      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      let statusWhileStarting: string | undefined;
      vi.mocked(process.exec).mockImplementationOnce(async () => {
        statusWhileStarting = connection.status();
        throw new Error('start failed');
      });

      await expect(connection.lifecycle?.start?.({ log: logger }, logger)).rejects.toThrow('start failed');

      expect(statusWhileStarting).toBe('starting');
      expect(providerMock.updateStatus).toHaveBeenCalledWith('starting');
    });

    it('should go back to stopped when the container system fails to start', async () => {
      expect.assertions(4);

      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      vi.mocked(process.exec).mockRejectedValueOnce(new Error('kernel download failed'));

      await expect(connection.lifecycle?.start?.({ log: logger }, logger)).rejects.toThrow('kernel download failed');

      expect(connection.status()).toBe('stopped');
      expect(providerMock.updateStatus).toHaveBeenLastCalledWith('stopped');
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should stop socktainer and the container system from the connection', async () => {
      expect.assertions(5);

      systemRunning = true;
      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      const socktainerProcess = vi.mocked(spawn).mock.results[0]?.value as ChildProcess;
      await connection.lifecycle?.stop?.({ log: logger }, logger);

      expect(socktainerProcess.kill).toHaveBeenCalledExactlyOnceWith();
      expect(process.exec).toHaveBeenCalledWith('container', ['system', 'stop'], {
        env: { PATH: expect.any(String) },
        logger,
      });
      expect(connection.status()).toBe('stopped');
      expect(providerMock.updateStatus).toHaveBeenLastCalledWith('stopped');
      expect(providerMock.registerContainerProviderConnection).toHaveBeenCalledExactlyOnceWith(connection);
    });

    it('should report the stopping status while the container system stops', async () => {
      expect.assertions(2);

      systemRunning = true;
      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      let statusWhileStopping: string | undefined;
      vi.mocked(process.exec).mockImplementationOnce(async () => {
        statusWhileStopping = connection.status();
        systemRunning = false;
        return { command: '', stderr: '', stdout: '' };
      });
      await connection.lifecycle?.stop?.({ log: logger }, logger);

      expect(statusWhileStopping).toBe('stopping');
      expect(providerMock.updateStatus).toHaveBeenCalledWith('stopping');
    });

    it('should start socktainer again when the container system fails to stop', async () => {
      expect.assertions(3);

      systemRunning = true;
      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      vi.mocked(process.exec).mockRejectedValueOnce(new Error('stop failed'));

      await expect(connection.lifecycle?.stop?.({ log: logger }, logger)).rejects.toThrow('stop failed');

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(connection.status()).toBe('started');
    });

    it('should wait for a running start before stopping the container system', async () => {
      expect.assertions(2);

      await containerProviderManager.updateContainerSystemStatus(providerMock);
      const connection = getRegisteredConnection();
      let finishStart: (() => void) | undefined;
      vi.mocked(process.exec).mockImplementationOnce(
        async () =>
          new Promise(resolve => {
            finishStart = (): void => {
              systemRunning = true;
              resolve({ command: '', stderr: '', stdout: '' });
            };
          }),
      );

      const start = connection.lifecycle?.start?.({ log: logger }, logger);
      const stop = connection.lifecycle?.stop?.({ log: logger }, logger);
      await vi.waitUntil(() => finishStart);

      expect(process.exec).not.toHaveBeenCalledWith('container', ['system', 'stop'], expect.anything());

      finishStart?.();
      await start;
      await stop;

      expect(getRegisteredConnection().status()).toBe('stopped');
    });

    it('should not register a connection when the extension is deactivated during the checks', async () => {
      expect.assertions(1);

      vi.mocked(process.exec).mockImplementation(async (_cmd, args) => {
        if (args?.[1] === 'status') {
          await containerProviderManager.deactivate();
        }
        return { command: '', stderr: '', stdout: 'container CLI version 1.4.2 (build: release, commit: d265d66)' };
      });

      await containerProviderManager.updateContainerSystemStatus(providerMock);

      expect(providerMock.registerContainerProviderConnection).not.toHaveBeenCalled();
    });
  });
});
