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

import type { ExtensionContext as PodmanDesktopExtensionContext, TelemetryLogger } from '@podman-desktop/api';
import { Container } from 'inversify';

import { ExtensionContextSymbol, TelemetryLoggerSymbol } from '../inject/symbol';

import { managersModule } from '../manager/manager-module';
import { ContainerProviderManager } from '../manager/container-provider-manager';

export class InversifyBinding {
  #container: Container | undefined;

  readonly #extensionContext: PodmanDesktopExtensionContext;
  readonly #telemetryLogger: TelemetryLogger;

  constructor(extensionContext: PodmanDesktopExtensionContext, telemetryLogger: TelemetryLogger) {
    this.#extensionContext = extensionContext;
    this.#telemetryLogger = telemetryLogger;
  }

  public async initBindings(): Promise<Container> {
    this.#container = new Container();

    this.#container.bind(ExtensionContextSymbol).toConstantValue(this.#extensionContext);
    this.#container.bind(TelemetryLoggerSymbol).toConstantValue(this.#telemetryLogger);

    await this.#container.load(managersModule);

    // Get container provider manager
    await this.#container.getAsync(ContainerProviderManager);
    return this.#container;
  }

  async dispose(): Promise<void> {
    if (this.#container) {
      await this.#container.unbindAll();
    }
  }
}
