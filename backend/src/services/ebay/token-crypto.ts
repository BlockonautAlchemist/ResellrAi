/**
 * Token Encryption Utilities
 *
 * Encrypts/decrypts eBay OAuth tokens using AES-256-GCM.
 * Tokens are encrypted before storage and decrypted only when needed for API calls.
 *
 * Security Requirements:
 * - EBAY_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)
 * - Generate with: openssl rand -hex 32
 * - Never log decrypted tokens
 * - Decrypted tokens exist in memory only briefly
 */

import crypto from 'crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment
 * @throws Error if key is not configured
 */
function getEncryptionKey(): Buffer {
  const keyHex = env.EBAY_TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('EBAY_TOKEN_ENCRYPTION_KEY is not configured');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a token string using AES-256-GCM
 *
 * @param plaintext - The token to encrypt
 * @returns Base64-encoded encrypted data (iv:authTag:ciphertext)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine iv:authTag:ciphertext and encode as base64
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt an encrypted token string
 *
 * @param encryptedData - Base64-encoded encrypted data from encryptToken
 * @returns The decrypted token string
 * @throws Error if decryption fails (tampered data, wrong key, etc.)
 */
export function decryptToken(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Generate a cryptographically secure state parameter for OAuth
 *
 * @param length - Length of the state string (default: 32 bytes = 64 hex chars)
 * @returns Random hex string for OAuth state parameter
 */
export function generateOAuthState(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Check if token encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  return !!env.EBAY_TOKEN_ENCRYPTION_KEY;
}

/**
 * Validate that the encryption key is properly formatted
 * @throws Error if key is invalid
 */
export function validateEncryptionKey(): void {
  const keyHex = env.EBAY_TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('EBAY_TOKEN_ENCRYPTION_KEY is not set');
  }
  if (keyHex.length !== 64) {
    throw new Error('EBAY_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('EBAY_TOKEN_ENCRYPTION_KEY must contain only hex characters');
  }
}
