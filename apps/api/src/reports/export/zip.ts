import { crc32, deflateRawSync } from 'zlib';

/** Classic ZIP (no ZIP64): at most 65 535 entries and 4 GiB. Callers keep archives well below that. */
export const ZIP_MAX_ENTRIES = 65_000;
export const ZIP_MAX_BYTES = 3.5 * 1024 ** 3;

type Sink = (chunk: Buffer) => void | Promise<void>;

function dosDateTime(at: Date) {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

/**
 * Streams entries as they are added, so a large photo archive never sits in memory whole.
 * Names are UTF-8 (general-purpose flag bit 11), which Windows Explorer, macOS and 7-Zip all read.
 */
export class ZipWriter {
  private readonly sink: Sink;
  private readonly central: Buffer[] = [];
  private offset = 0;
  private entries = 0;

  constructor(sink: Sink) {
    this.sink = sink;
  }

  get size() {
    return this.offset;
  }

  async add(name: string, data: Buffer, options: { date?: Date; compress?: boolean } = {}) {
    if (this.entries >= ZIP_MAX_ENTRIES) throw new Error('Too many files for one archive');
    const nameBytes = Buffer.from(name, 'utf8');
    const checksum = crc32(data) >>> 0;
    const body = options.compress ? deflateRawSync(data) : data;
    const method = options.compress ? 8 : 0;
    const { time, day } = dosDateTime(options.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(this.offset, 42);
    this.central.push(header, nameBytes);

    await this.sink(local);
    await this.sink(nameBytes);
    await this.sink(body);
    this.offset += local.length + nameBytes.length + body.length;
    this.entries += 1;
  }

  async finish() {
    const start = this.offset;
    let length = 0;
    for (const part of this.central) {
      await this.sink(part);
      length += part.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries, 8);
    end.writeUInt16LE(this.entries, 10);
    end.writeUInt32LE(length, 12);
    end.writeUInt32LE(start, 16);
    await this.sink(end);
    this.offset += length + end.length;
  }
}

/** Whole archive in memory, for small files such as an .xlsx workbook. */
export async function zipToBuffer(files: { name: string; data: Buffer }[]) {
  const chunks: Buffer[] = [];
  const zip = new ZipWriter((chunk) => {
    chunks.push(chunk);
  });
  for (const file of files) await zip.add(file.name, file.data, { compress: true });
  await zip.finish();
  return Buffer.concat(chunks);
}
