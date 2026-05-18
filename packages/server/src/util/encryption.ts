
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getEncryptionKey(secret: string) {
  const keyMaterial = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSession(data: object, secret: string) {
  const key = await getEncryptionKey(secret);

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const plaintext = encoder.encode(JSON.stringify(data));
  const cipertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  const combined = new Uint8Array(iv.length + cipertextBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipertextBuffer), iv.length);

  let binaryString = "";
  for(let i = 0; i < combined.length; i++) {
    binaryString += String.fromCharCode(combined[i]);
  }

  return btoa(binaryString);
}

export async function decryptSession(base64String: string, secret: string) {
  const key = await getEncryptionKey(secret);

  const binaryString = atob(base64String);
  const combined = new Uint8Array(binaryString.length);
  for(let i = 0; i < binaryString.length; i++) {
    combined[i] = binaryString.charCodeAt(i);
  }

  const iv = combined.slice(0, 12);
  const cipertext = combined.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipertext
  );

  return JSON.parse(decoder.decode(decryptedBuffer)) as unknown;
}