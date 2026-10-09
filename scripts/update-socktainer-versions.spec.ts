/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
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

import { describe, expect, it } from 'vitest';
import { SocktainerVersionsUpdater } from './update-socktainer-versions';

const containerTags = ['1.5.0', '1.4.1', '1.3.1', '1.3.0', '1.2.2', '1.2.1', '1.2.0', '0.12.3', '0.9.0'];
const socktainerTags = ['v1.5.1', 'v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.1', 'v1.2.0', 'v0.12.0', 'v0.0.1-rc'];

describe('computeVersions', () => {
  const updater = new SocktainerVersionsUpdater();

  it('should map the last 3 container minors to the latest socktainer patch', () => {
    expect.assertions(2);

    const versions = updater.computeVersions(containerTags, socktainerTags);

    expect(versions).toStrictEqual({ '1.5': 'v1.5.1', '1.4': 'v1.4.0', '1.3': 'v1.3.0' });
    expect(Object.keys(versions)).toStrictEqual(['1.5', '1.4', '1.3']);
  });

  it('should skip container minors without a socktainer counterpart', () => {
    expect.assertions(1);

    expect(
      updater.computeVersions(['1.10.0', '1.6.0', ...containerTags], [...socktainerTags, 'v1.10.0']),
    ).toStrictEqual({ '1.10': 'v1.10.0', '1.5': 'v1.5.1', '1.4': 'v1.4.0' });
  });
});
