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
  type ExtensionContext,
  type Provider,
  type TelemetryLogger,
  type TelemetryTrustedValue,
  process,
  window,
} from '@podman-desktop/api';
import { ContainerProviderManager } from './container-provider-manager';
import { resolve } from 'node:path';
import { type ChildProcess, spawn } from 'node:child_process';

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

  it('should report an unsupported container version only once', async () => {
    expect.assertions(3);

    mockContainerVersion('1.2.0');

    await containerProviderManager.updateContainerSystemStatus(providerMock);
    await containerProviderManager.updateContainerSystemStatus(providerMock);

    expect(providerMock.updateStatus).toHaveBeenLastCalledWith('error');
    expect(spawn).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('1.2.0'));
  });
});
