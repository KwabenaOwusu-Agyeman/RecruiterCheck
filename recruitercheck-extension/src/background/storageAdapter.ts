// The one place chrome.storage is touched directly — everything else in
// background/ talks to the Supabase client, not the browser storage API, so
// swapping this file is the only change needed to port the session layer to
// another WebExtension-compatible browser.
export const chromeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key)
    return (result[key] as string | undefined) ?? null
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key)
  },
}
