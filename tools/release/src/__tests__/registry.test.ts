import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRegistryClient } from '../registry.js';

const REGISTRY = 'https://registry.npmjs.org';

const respondWith = (
  body: unknown,
  init: { status?: number; statusText?: string; json?: boolean } = {}
) =>
  ({
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    ok: (init.status ?? 200) < 400,
    json: async () => {
      if (init.json === false) throw new SyntaxError('Unexpected token <');
      return body;
    },
  }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRegistryClient', () => {
  it('returns every published version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respondWith({ versions: { '0.14.0': {}, '0.15.0': {} } })
      )
    );

    await expect(
      createRegistryClient(REGISTRY).fetchPublishedVersions(
        '@babylonlabs-io/babylon-tbv-rust-wasm'
      )
    ).resolves.toEqual(['0.14.0', '0.15.0']);
  });

  it('reports a package that has never been published as null rather than throwing', async () => {
    // The caller has to tell "no such package" from "the registry hiccuped":
    // both block the release, for different reasons the operator needs to see.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respondWith({}, { status: 404, statusText: 'Not Found' }))
    );

    await expect(
      createRegistryClient(REGISTRY).fetchPublishedVersions(
        '@babylonlabs-io/never-published'
      )
    ).resolves.toBeNull();
  });

  it('throws on any other error status so the release fails closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respondWith({}, { status: 502, statusText: 'Bad Gateway' })
      )
    );

    await expect(
      createRegistryClient(REGISTRY).fetchPublishedVersions('@scope/pkg')
    ).rejects.toThrow('502 Bad Gateway');
  });

  it('throws when the request cannot be made at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    await expect(
      createRegistryClient(REGISTRY).fetchPublishedVersions('@scope/pkg')
    ).rejects.toThrow('Could not reach');
  });

  it('throws when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respondWith(null, { json: false }))
    );

    await expect(
      createRegistryClient(REGISTRY).fetchPublishedVersions('@scope/pkg')
    ).rejects.toThrow('not JSON');
  });

  it('throws when the packument carries no versions map', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respondWith({ name: '@scope/pkg' })));

    await expect(
      createRegistryClient(REGISTRY).fetchPublishedVersions('@scope/pkg')
    ).rejects.toThrow('no "versions" map');
  });

  it('encodes the scoped name and normalises a registry url without a trailing slash', async () => {
    const fetchMock = vi.fn(async () => respondWith({ versions: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await createRegistryClient(REGISTRY).fetchPublishedVersions(
      '@babylonlabs-io/ts-sdk'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/%40babylonlabs-io%2Fts-sdk',
      expect.anything()
    );
  });

  it('asks the registry once per package', async () => {
    const fetchMock = vi.fn(async () => respondWith({ versions: { '1.0.0': {} } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRegistryClient(REGISTRY);

    await client.fetchPublishedVersions('@scope/pkg');
    await client.fetchPublishedVersions('@scope/pkg');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed lookup failed for the rest of the run', async () => {
    // This gate fails closed, so one unanswered lookup must not become a
    // second chance that lets a broken pin through.
    const fetchMock = vi
      .fn(async () => respondWith({ versions: { '1.0.0': {} } }))
      .mockImplementationOnce(async () => {
        throw new TypeError('fetch failed');
      });
    vi.stubGlobal('fetch', fetchMock);
    const client = createRegistryClient(REGISTRY);

    await expect(
      client.fetchPublishedVersions('@scope/pkg')
    ).rejects.toThrow('Could not reach');
    await expect(
      client.fetchPublishedVersions('@scope/pkg')
    ).rejects.toThrow('Could not reach');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
