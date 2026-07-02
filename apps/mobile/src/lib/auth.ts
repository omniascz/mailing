/**
 * Credential storage for the ForgeMsg mobile app.
 *
 * The app authenticates against the existing REST API with a ForgeMsg API key
 * (the same x-api-key mechanism the Zapier bridge uses) plus a configurable
 * API base URL, so no separate mobile session/cookie handling is needed.
 * Secrets are kept in the OS keychain via expo-secure-store.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_APIKEY = 'forgemsg_api_key';
const KEY_BASEURL = 'forgemsg_base_url';

export const DEFAULT_BASE_URL = 'https://api.forgemsg.io';

export interface Credentials {
  apiKey: string;
  baseUrl: string;
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  await SecureStore.setItemAsync(KEY_APIKEY, creds.apiKey);
  await SecureStore.setItemAsync(KEY_BASEURL, creds.baseUrl);
}

export async function loadCredentials(): Promise<Credentials | null> {
  const apiKey = await SecureStore.getItemAsync(KEY_APIKEY);
  const baseUrl = (await SecureStore.getItemAsync(KEY_BASEURL)) ?? DEFAULT_BASE_URL;
  if (!apiKey) return null;
  return { apiKey, baseUrl };
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_APIKEY);
  await SecureStore.deleteItemAsync(KEY_BASEURL);
}
