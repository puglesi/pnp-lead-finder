const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;

    encoded += BASE64_ALPHABET[first >> 2];
    encoded +=
      BASE64_ALPHABET[((first & 0b00000011) << 4) | (second >> 4)];
    encoded += hasSecond
      ? BASE64_ALPHABET[
          ((second & 0b00001111) << 2) | (third >> 6)
        ]
      : "=";
    encoded += hasThird
      ? BASE64_ALPHABET[third & 0b00111111]
      : "=";
  }
  return encoded;
}

function base64ToBytes(base64: string): Uint8Array | null {
  if (
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    return null;
  }

  const bytes: number[] = [];
  for (let index = 0; index < base64.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(base64[index]);
    const second = BASE64_ALPHABET.indexOf(base64[index + 1]);
    const thirdCharacter = base64[index + 2];
    const fourthCharacter = base64[index + 3];
    const third =
      thirdCharacter === "="
        ? 0
        : BASE64_ALPHABET.indexOf(thirdCharacter);
    const fourth =
      fourthCharacter === "="
        ? 0
        : BASE64_ALPHABET.indexOf(fourthCharacter);

    if (
      first < 0 ||
      second < 0 ||
      third < 0 ||
      fourth < 0 ||
      (thirdCharacter === "=" && fourthCharacter !== "=")
    ) {
      return null;
    }

    bytes.push((first << 2) | (second >> 4));
    if (thirdCharacter !== "=") {
      bytes.push(((second & 0b00001111) << 4) | (third >> 2));
    }
    if (fourthCharacter !== "=") {
      bytes.push(((third & 0b00000011) << 6) | fourth);
    }
  }
  return Uint8Array.from(bytes);
}

export function encodeUtf8Base64Url(value: string): string {
  const base64 = bytesToBase64(new TextEncoder().encode(value));
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeUtf8Base64Url(token: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(token) || token.length % 4 === 1) {
    return null;
  }
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = base64ToBytes(padded);
  if (!bytes) return null;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
