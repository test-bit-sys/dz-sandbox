export const ZREXPRESS_SPEC = {
  provider: 'zrexpress',
  displayName: 'ZR Express Delivery',
  status: 'scaffold' as const,
  verified: false,
  source: 'unverified - awaiting official documentation or sanitized captured fixtures',
  endpoints: {
    // Intentionally empty until verified documentation or captured fixtures are contributed.
  } as Record<string, string>,
  notes: [
    'All API routes return 501 NOT_IMPLEMENTED_AWAITING_SPEC rather than inventing paths or schemas.',
    'Do not promote endpoints here without a source in docs/SPEC_STATUS.md or fixtures/zrexpress/captured/.',
  ],
} as const;
