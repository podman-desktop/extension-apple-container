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
import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * Mock the extension API for vitest.
 * This file is referenced from vitest.config.js file.
 */

const FakeEventEmitter = class extends EventEmitter {
  fire = vi.fn();
};

const plugin = {
  cli: {
    createCliTool: vi.fn(),
  },
  authentication: {
    getSession: vi.fn(),
    registerAuthenticationProvider: vi.fn(),
  },
  provider: {
    createProvider: vi.fn(),
    onDidUpdateContainerConnection: vi.fn(),
    onDidRegisterContainerConnection: vi.fn(),
    onDidUnregisterContainerConnection: vi.fn(),
  },
  containerEngine: {
    onEvent: vi.fn(),
    listContainers: vi.fn(),
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
  },
  window: {
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showErrorMessage: vi.fn(),
    withProgress: vi.fn(),
    showNotification: vi.fn(),
    showQuickPick: vi.fn(),
  },
  ProgressLocation: {
    APP_ICON: 1,
  },
  EventEmitter: FakeEventEmitter,
  Uri: {
    parse: vi.fn(),
  },
  env: {
    isLinux: false,
    isMac: false,
    isWindows: false,
    createTelemetryLogger: vi.fn(),
    openExternal: vi.fn(),
  },
  process: {
    exec: vi.fn(),
  },
};

module.exports = plugin;
