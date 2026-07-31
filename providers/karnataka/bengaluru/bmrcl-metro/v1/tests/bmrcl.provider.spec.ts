import { BmrclProvider } from '../bmrcl.provider';

describe('BmrclProvider', () => {
  it('uses the canonical BMRCL provider identity', () => {
    const provider = new BmrclProvider();

    expect(provider.providerCode).toBe('BMRCL');
    expect(provider.version).toBe('v1');
  });
});
