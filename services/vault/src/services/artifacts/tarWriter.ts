/**
 * POSIX ustar headers and padding for the recovery kit.
 *
 * Hand-rolled: the kit needs one header shape and zero padding, the only tar
 * package in the tree (`tar-stream`) is a transitive nx dev dependency the app
 * does not install, and a runtime archive dependency would need its own pinned
 * audit for a 512-byte header.
 */

const TAR_BLOCK_BYTES = 512;
export const TAR_END_OF_ARCHIVE_BYTES = 2 * TAR_BLOCK_BYTES;

/** Largest size an 11-digit octal size field holds (2^33 - 1). */
const TAR_MAX_ENTRY_BYTES = 0o77777777777;

const TAR_NAME_OFFSET = 0;
const TAR_NAME_MAX_BYTES = 100;
const TAR_MODE_OFFSET = 100;
const TAR_MODE_WIDTH = 8;
const TAR_UID_OFFSET = 108;
const TAR_GID_OFFSET = 116;
const TAR_ID_WIDTH = 8;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_WIDTH = 12;
const TAR_MTIME_OFFSET = 136;
const TAR_MTIME_WIDTH = 12;
const TAR_CHECKSUM_OFFSET = 148;
const TAR_CHECKSUM_WIDTH = 8;
const TAR_CHECKSUM_DIGITS = 6;
const TAR_TYPEFLAG_OFFSET = 156;
const TAR_MAGIC_OFFSET = 257;
const TAR_VERSION_OFFSET = 263;
const TAR_DEVMAJOR_OFFSET = 329;
const TAR_DEVMINOR_OFFSET = 337;
const TAR_DEVICE_WIDTH = 8;

const TAR_MODE = 0o644;
const TAR_ZERO_ID = 0;
const TAR_MTIME = 0;
const TAR_TYPEFLAG_FILE = "0";
const TAR_MAGIC = "ustar\0";
const TAR_VERSION = "00";
const ASCII_SPACE = 0x20;

const encoder = new TextEncoder();

function writeAscii(header: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) header[offset + i] = text.charCodeAt(i);
}

/** `value` as `width - 1` zero-padded octal digits and a trailing NUL. */
function writeOctal(
  header: Uint8Array,
  offset: number,
  width: number,
  value: number,
): void {
  writeAscii(header, offset, value.toString(8).padStart(width - 1, "0") + "\0");
}

/** A 512-byte ustar header for a regular file named `name` of `size` bytes. */
export function tarHeader(name: string, size: number): Uint8Array<ArrayBuffer> {
  const encodedName = encoder.encode(name);
  if (encodedName.byteLength > TAR_NAME_MAX_BYTES || name.includes("\0")) {
    throw new RangeError(
      `Tar entry name must be at most ${TAR_NAME_MAX_BYTES} UTF-8 bytes without NUL: ${name}`,
    );
  }
  if (!Number.isSafeInteger(size) || size < 0 || size > TAR_MAX_ENTRY_BYTES) {
    throw new RangeError(
      `Tar entry size must be an integer from 0 to ${TAR_MAX_ENTRY_BYTES}: ${size}`,
    );
  }

  const header = new Uint8Array(TAR_BLOCK_BYTES);
  header.set(encodedName, TAR_NAME_OFFSET);
  writeOctal(header, TAR_MODE_OFFSET, TAR_MODE_WIDTH, TAR_MODE);
  writeOctal(header, TAR_UID_OFFSET, TAR_ID_WIDTH, TAR_ZERO_ID);
  writeOctal(header, TAR_GID_OFFSET, TAR_ID_WIDTH, TAR_ZERO_ID);
  writeOctal(header, TAR_SIZE_OFFSET, TAR_SIZE_WIDTH, size);
  writeOctal(header, TAR_MTIME_OFFSET, TAR_MTIME_WIDTH, TAR_MTIME);
  writeAscii(header, TAR_TYPEFLAG_OFFSET, TAR_TYPEFLAG_FILE);
  writeAscii(header, TAR_MAGIC_OFFSET, TAR_MAGIC);
  writeAscii(header, TAR_VERSION_OFFSET, TAR_VERSION);
  writeOctal(header, TAR_DEVMAJOR_OFFSET, TAR_DEVICE_WIDTH, TAR_ZERO_ID);
  writeOctal(header, TAR_DEVMINOR_OFFSET, TAR_DEVICE_WIDTH, TAR_ZERO_ID);

  // The checksum covers the header with its own field read as spaces.
  header.fill(
    ASCII_SPACE,
    TAR_CHECKSUM_OFFSET,
    TAR_CHECKSUM_OFFSET + TAR_CHECKSUM_WIDTH,
  );
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeAscii(
    header,
    TAR_CHECKSUM_OFFSET,
    checksum.toString(8).padStart(TAR_CHECKSUM_DIGITS, "0") + "\0 ",
  );

  return header;
}

/** Zero bytes after `size` bytes of data that reach the next block boundary. */
export function tarPaddingBytes(size: number): number {
  return (TAR_BLOCK_BYTES - (size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES;
}

export function tarPadding(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(tarPaddingBytes(size));
}

/** The two zero blocks that end an archive. */
export function tarEndOfArchive(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(TAR_END_OF_ARCHIVE_BYTES);
}

/** Bytes one entry occupies: header, data and padding. */
export function tarEntryBytes(size: number): number {
  return TAR_BLOCK_BYTES + size + tarPaddingBytes(size);
}
