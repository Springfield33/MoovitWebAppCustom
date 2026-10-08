// Base64 → Uint8Array senza atob/Buffer (non disponibili in modo affidabile in Scriptable).

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Uint8Array(128);
for (let i = 0; i < 64; i++) B64_INDEX[B64_ALPHABET.charCodeAt(i)] = i;

export function b64ToBytes(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64_INDEX[clean.charCodeAt(i)] << 18) | (B64_INDEX[clean.charCodeAt(i + 1)] << 12)
      | (B64_INDEX[clean.charCodeAt(i + 2)] << 6) | B64_INDEX[clean.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
