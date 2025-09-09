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
import { type ExtensionContext, type TelemetryLogger, type TelemetryTrustedValue } from '@podman-desktop/api';
import { ContainerProviderManager } from './container-provider-manager';

vi.mock(import('node:path'));
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

  await container.unbindAll();
});

describe('init/post construct', () => {
  it('should check postconstruct is performed', () => {
    expect.assertions(1);

    expect(containerProviderManager).toBeInstanceOf(ContainerProviderManager);
  });
});
