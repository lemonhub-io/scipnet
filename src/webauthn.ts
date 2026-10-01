import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type { PublicUser } from '../shared/api-types';
import { ApiError, api } from './api';

export const passkeysSupported = browserSupportsWebAuthn();

const localErr = (code: string): ApiError => new ApiError(0, { error: { code, message: '' } });

/** Maps authenticator/browser rejections onto localized error codes. */
function wrapCeremonyError(e: unknown): never {
  if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
    throw localErr('passkey_cancelled');
  }
  if (e instanceof ApiError) throw e;
  throw localErr('passkey_failed');
}

/**
 * Mandatory pre-signup ceremony: creates and verifies a passkey.
 * Returns the challenge token to submit with the registration form.
 */
export async function verifyNewPasskey(): Promise<string> {
  if (!passkeysSupported) throw localErr('passkey_unsupported');
  const { token, options } = await api.webauthnRegisterOptions();
  const attestation = await startRegistration({ optionsJSON: options }).catch(wrapCeremonyError);
  await api.webauthnRegisterVerify(token, attestation);
  return token;
}

/**
 * Passkey sign-in. With `username` the prompt is scoped to that member's
 * passkeys; without it the browser offers any discoverable passkey for this site.
 */
export async function signInWithPasskey(username?: string): Promise<PublicUser> {
  if (!passkeysSupported) throw localErr('passkey_unsupported');
  const { token, options } = await api.webauthnLoginOptions(username);
  const assertion = await startAuthentication({ optionsJSON: options }).catch(wrapCeremonyError);
  const { user } = await api.webauthnLoginVerify(token, assertion);
  return user;
}
