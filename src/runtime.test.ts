import { describe, expect, it } from 'vitest';
import { toPublicProjectError } from '../lib/runtime';

describe('toPublicProjectError', () => {
  it('hides raw missing-runtime process errors from end users', () => {
    expect(toPublicProjectError(new Error('spawn FreeCADCmd ENOENT'), 'preview')).toBe(
      'Preview is unavailable until the server FreeCAD runtime is configured.'
    );
  });

  it('returns non-runtime errors directly', () => {
    expect(toPublicProjectError(new Error('Unsupported export format.'), 'export')).toBe('Unsupported export format.');
  });
});
