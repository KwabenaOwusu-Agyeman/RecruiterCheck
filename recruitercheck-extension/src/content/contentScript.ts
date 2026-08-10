import { captureJobFromPage } from '@/capture'

// Injected on-demand via chrome.scripting.executeScript, only after the
// user clicks the extension action — never a persistent content_scripts
// listener, never runs on page load. Computes the result once and stashes
// it for a follow-up executeScript call to read back (MV3's structured-
// clone result channel can't carry the return value of a dynamically
// imported bundle directly, so this two-step read is the standard pattern).
;(window as unknown as { __recruiterCheckCapture: unknown }).__recruiterCheckCapture =
  captureJobFromPage(window.location.hostname, document, window.location.href)
