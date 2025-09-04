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

import { type ExtensionContext, env } from '@podman-desktop/api';
import { InversifyBinding } from './inject/inversify-binding';
import type { Container } from 'inversify';
import { ContainerProviderManager } from './manager/container-provider-manager';

export class AppleContainerExtension {
  readonly #extensionContext: ExtensionContext;

  #containerProviderManager: ContainerProviderManager | undefined;

  #inversifyBinding: InversifyBinding | undefined;

  #container: Container | undefined;

  constructor(readonly extensionContext: ExtensionContext) {
    this.#extensionContext = extensionContext;
  }

  async activate(): Promise<void> {
    const telemetryLogger = env.createTelemetryLogger();

    this.#inversifyBinding = new InversifyBinding(this.#extensionContext, telemetryLogger);
    this.#container = await this.#inversifyBinding.initBindings();

    try {
      this.#containerProviderManager = await this.getContainer()?.getAsync(ContainerProviderManager);
    } catch (e) {
      console.error('Error while creating the container provider manager', e);
      return;
    }

    // Perform the registration after the startup to not hold up the startup
    this.deferActivate().catch((e: unknown) => {
      console.error('error in deferActivate', e);
    });
  }

  protected async deferActivate(): Promise<void> {
    if (env.isMac) {
      console.info('Apple Container Extension activated on macOS');
      await this.#containerProviderManager?.registerContainerProvider();
    }
  }

  async deactivate(): Promise<void> {
    await this.#inversifyBinding?.dispose();
    this.#containerProviderManager = undefined;
  }

  protected getContainer(): Container | undefined {
    return this.#container;
  }
}
