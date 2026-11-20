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

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import socktainerVersions from '../socktainer-versions.json';
import { Downloader } from './download';

vi.mock(import('node:fs'));
vi.mock(import('adm-zip'));

const archive = Buffer.from('socktainer archive');
const archiveSha256 = createHash('sha256').update(archive).digest('hex');
const outputDir = '/out';
const zipPath = path.join(outputDir, 'socktainer.zip');
const url = 'https://github.com/socktainer/socktainer/releases/download/v1.0.0/socktainer.zip';

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(fs.existsSync).mockReturnValue(true);
  // a constructor mock needs a regular function, not an arrow function
  // biome-ignore lint/complexity/useArrowFunction: arrow functions can't be called with new
  vi.mocked(AdmZip).mockImplementation(function () {
    return { extractAllTo: vi.fn() } as unknown as AdmZip;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('socktainer-versions.json', () => {
  it('should have a SHA-256 checksum for every version', () => {
    expect.assertions(1);

    const entries = Object.values(socktainerVersions);

    expect(entries.every(entry => /^[\da-f]{64}$/.test(entry.sha256))).toBe(true);
  });
});

describe('downloadAndExtract', () => {
  it('should write and extract the archive when the checksum matches', async () => {
    expect.assertions(4);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(archive),
      }),
    );

    await new Downloader().downloadAndExtract('v1.0.0', archiveSha256, outputDir);

    expect(fetch).toHaveBeenCalledWith(url);
    expect(fs.promises.writeFile).toHaveBeenCalledWith(zipPath, archive);
    expect(AdmZip).toHaveBeenCalledWith(zipPath);
    expect(fs.promises.chmod).toHaveBeenCalledWith(path.join(outputDir, 'socktainer'), 0o755);
  });

  it('should reject a mismatching archive without writing or extracting anything', async () => {
    expect.assertions(3);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(archive),
      }),
    );
    const expected = '0'.repeat(64);

    await expect(new Downloader().downloadAndExtract('v1.0.0', expected, outputDir)).rejects.toThrow(
      `Checksum mismatch for ${url}: expected SHA-256 ${expected}, got ${archiveSha256}`,
    );

    expect(fs.promises.writeFile).not.toHaveBeenCalled();
    expect(AdmZip).not.toHaveBeenCalled();
  });

  it('should fail when the download is not successful', async () => {
    expect.assertions(2);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(new Downloader().downloadAndExtract('v1.0.0', archiveSha256, outputDir)).rejects.toThrow(
      `Failed to download ${url} (404)`,
    );

    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });
});
