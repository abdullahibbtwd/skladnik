import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    const endpointHost = config.getOrThrow<string>('MINIO_ENDPOINT');
    const port = config.get<string>('MINIO_PORT') ?? '9000';
    const useSsl = config.get<string>('MINIO_USE_SSL') === 'true';
    const protocol = useSsl ? 'https' : 'http';
    const endpoint = `${protocol}://${endpointHost}:${port}`;
    const publicHost = config.get<string>('MINIO_PUBLIC_ENDPOINT') ?? endpointHost;
    const credentials = {
      accessKeyId: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    };

    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'invoices';
    this.publicBaseUrl = `${protocol}://${publicHost}:${port}`;
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials,
    });
    // Presigning is local; use the host-reachable endpoint so browsers can open the URL.
    this.signingClient = new S3Client({
      region: 'us-east-1',
      endpoint: this.publicBaseUrl,
      forcePathStyle: true,
      credentials,
    });
  }

  async onModuleInit() {
    // Do not block or crash the API if MinIO is slow. Coolify marks the
    // whole stack failed when this process exits before it listens.
    void this.ensureBucketInBackground();
  }

  private async ensureBucketInBackground() {
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      try {
        await this.ensurePrivateBucket();
        if (attempt > 1) {
          console.log(`[minio] bucket ready after attempt ${attempt}`);
        }
        return;
      } catch (error) {
        console.error(`[minio] bucket setup failed (attempt ${attempt}/15)`, error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    console.error('[minio] continuing without a ready bucket; uploads will fail until MinIO is reachable');
  }

  async ping(): Promise<boolean> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return true;
  }

  publicObjectUrl(key: string): string {
    return `${this.publicBaseUrl}/${this.bucket}/${key}`;
  }

  async upload(file: Express.Multer.File): Promise<{
    key: string;
    signedUrl: string;
    publicUrl: string;
  }> {
    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
    const key = `${Date.now()}-${safeName}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      key,
      signedUrl: await this.signedUrl(key),
      publicUrl: this.publicObjectUrl(key),
    };
  }

  async signedUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 60 * 5 },
    );
  }

  async getObject(key: string): Promise<{
    body: Readable;
    contentType?: string;
  }> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
    };
  }

  private async ensurePrivateBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    // Bucket stays private (no anonymous policy). Objects are served via
    // signed URLs or authenticated API download only.
  }
}
