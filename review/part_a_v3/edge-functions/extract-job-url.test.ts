// Real, executable Deno test file (requires `deno test` -- not available in
// this review session's shell, so these have NOT been run; static-parsed
// only via manual inspection, not via `deno check`, which is also
// unavailable here). Run with: deno test extract-job-url.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isPrivateOrReservedIp, resolveSafeUrl } from './extract-job-url.ts'

Deno.test('T-URL-1: rejects non-http(s) protocols', async () => {
  assertEquals(await resolveSafeUrl('ftp://example.com/x'), null)
  assertEquals(await resolveSafeUrl('file:///etc/passwd'), null)
  assertEquals(await resolveSafeUrl('gopher://example.com'), null)
})

Deno.test('T-URL-2: rejects credentials embedded in URL', async () => {
  assertEquals(await resolveSafeUrl('https://user:pass@example.com/job'), null)
  assertEquals(await resolveSafeUrl('https://onlyuser@example.com/job'), null)
})

Deno.test('T-URL-3: blocks loopback IPv4', () => {
  assertEquals(isPrivateOrReservedIp('127.0.0.1'), true)
  assertEquals(isPrivateOrReservedIp('127.255.255.255'), true)
})

Deno.test('T-URL-4: blocks all required private/reserved IPv4 ranges', () => {
  assertEquals(isPrivateOrReservedIp('0.0.0.0'), true)
  assertEquals(isPrivateOrReservedIp('10.1.2.3'), true)
  assertEquals(isPrivateOrReservedIp('100.64.0.1'), true)
  assertEquals(isPrivateOrReservedIp('100.127.255.255'), true)
  assertEquals(isPrivateOrReservedIp('169.254.169.254'), true) // cloud metadata IP
  assertEquals(isPrivateOrReservedIp('172.16.0.1'), true)
  assertEquals(isPrivateOrReservedIp('172.31.255.255'), true)
  assertEquals(isPrivateOrReservedIp('192.168.1.1'), true)
})

Deno.test('T-URL-5: blocks multicast and reserved IPv4 (V3 fix)', () => {
  assertEquals(isPrivateOrReservedIp('224.0.0.1'), true)
  assertEquals(isPrivateOrReservedIp('239.255.255.255'), true)
  assertEquals(isPrivateOrReservedIp('240.0.0.1'), true)
  assertEquals(isPrivateOrReservedIp('255.255.255.255'), true)
})

Deno.test('T-URL-6: allows genuinely public IPv4', () => {
  assertEquals(isPrivateOrReservedIp('8.8.8.8'), false)
  assertEquals(isPrivateOrReservedIp('1.1.1.1'), false)
  assertEquals(isPrivateOrReservedIp('93.184.216.34'), false)
})

Deno.test('T-URL-7: blocks IPv6 loopback, link-local, unique-local', () => {
  assertEquals(isPrivateOrReservedIp('::1'), true)
  assertEquals(isPrivateOrReservedIp('[::1]'), true)
  assertEquals(isPrivateOrReservedIp('fe80::1'), true)
  assertEquals(isPrivateOrReservedIp('fc00::1'), true)
  assertEquals(isPrivateOrReservedIp('fd12:3456::1'), true)
})

Deno.test('T-URL-8: blocks IPv4-mapped private IPv6, both forms', () => {
  assertEquals(isPrivateOrReservedIp('::ffff:169.254.169.254'), true)
  assertEquals(isPrivateOrReservedIp('::ffff:a9fe:a9fe'), true) // hex form of 169.254.169.254
  assertEquals(isPrivateOrReservedIp('::ffff:10.0.0.1'), true)
})

Deno.test('T-URL-9: rejects localhost and .local hostnames without DNS lookup', async () => {
  assertEquals(await resolveSafeUrl('http://localhost/x'), null)
  assertEquals(await resolveSafeUrl('http://printer.local/x'), null)
  assertEquals(await resolveSafeUrl('http://foo.localhost/x'), null)
})

// Note: full redirect-chain and DNS-resolution-dependent tests (T-URL-1
// redirect variants, DNS rebinding simulation) require network access or a
// mock DNS/HTTP layer not set up in this review-only file -- flagged as
// requiring a running Deno test environment with network mocking before
// they can be executed, not claimed as passing here.
