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
import { type Release, SocktainerVersionsUpdater } from './update-socktainer-versions';

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

describe('computeChecksums', () => {
  const updater = new SocktainerVersionsUpdater();

  const release = (tag: string, assets: Release['assets']): Release => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets,
  });

  it('should map each socktainer version to the SHA-256 of its socktainer.zip asset', () => {
    expect.assertions(1);

    const releases = [
      release('v1.5.1', [
        { name: 'socktainer', digest: `sha256:${'1'.repeat(64)}` },
        { name: 'socktainer.zip', digest: `sha256:${'a'.repeat(64)}` },
      ]),
      release('v1.5.0', [{ name: 'socktainer.zip', digest: `sha256:${'0'.repeat(64)}` }]),
      release('v1.4.0', [{ name: 'socktainer.zip', digest: `sha256:${'b'.repeat(64)}` }]),
    ];

    expect(updater.computeChecksums({ '1.5': 'v1.5.1', '1.4': 'v1.4.0' }, releases)).toStrictEqual({
      'v1.5.1': 'a'.repeat(64),
      'v1.4.0': 'b'.repeat(64),
    });
  });

  it.each([
    ['the release is missing', []],
    [
      'the release has no socktainer.zip asset',
      [release('v1.5.1', [{ name: 'socktainer', digest: `sha256:${'1'.repeat(64)}` }])],
    ],
    ['the asset has no digest', [release('v1.5.1', [{ name: 'socktainer.zip', digest: null }])]],
    [
      'the digest is not a SHA-256',
      [release('v1.5.1', [{ name: 'socktainer.zip', digest: `sha512:${'a'.repeat(128)}` }])],
    ],
  ])('should fail when %s', (_case, releases) => {
    expect.assertions(1);

    expect(() => updater.computeChecksums({ '1.5': 'v1.5.1' }, releases)).toThrow(
      'No SHA-256 digest found for the socktainer.zip asset of socktainer v1.5.1',
    );
  });
});
