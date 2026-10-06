export interface TarEntry {
  path: string;
  size: number;
  content?: Buffer;
}

function text(block: Buffer, start: number, length: number) {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

function octal(block: Buffer, start: number, length: number) {
  // Base-256 sizes (high bit set) only occur for files over 8 GB; reject them.
  if (block[start] & 0x80) return -1;
  const value = text(block, start, length).trim();
  return value ? parseInt(value, 8) : 0;
}

function paxPath(data: Buffer) {
  // Records are "<length> key=value\n"; only the path is needed.
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = parseInt(data.subarray(offset, space).toString(), 10);
    if (!length) break;
    const record = data.subarray(space + 1, offset + length - 1).toString();
    if (record.startsWith("path=")) return record.slice(5).replace(/\n$/, "");
    offset += length;
  }
  return undefined;
}

/**
 * Reads regular files from an uncompressed tar archive. `keep` decides which
 * file bodies are retained; every file still appears in the index with its size.
 */
export function readTar(
  archive: Buffer,
  keep: (path: string, size: number) => boolean,
  maxEntries = 30000,
) {
  const entries: TarEntry[] = [];
  let offset = 0,
    longName: string | undefined;
  while (offset + 512 <= archive.length && entries.length < maxEntries) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    if (size < 0)
      throw new Error("Repository archive contains an oversized entry");
    const type = String.fromCharCode(header[156] || 48);
    const bodyStart = offset + 512;
    const body = archive.subarray(bodyStart, bodyStart + size);
    offset = bodyStart + Math.ceil(size / 512) * 512;
    if (type === "x") {
      longName = paxPath(body);
      continue;
    }
    if (type === "L") {
      longName = text(body, 0, body.length);
      continue;
    }
    if (type === "g") continue;
    const prefix = text(header, 345, 155);
    const path =
      longName ?? (prefix ? prefix + "/" : "") + text(header, 0, 100);
    longName = undefined;
    if (type !== "0" && type !== "7") continue;
    entries.push({
      path,
      size,
      ...(keep(path, size) ? { content: Buffer.from(body) } : {}),
    });
  }
  return entries;
}
