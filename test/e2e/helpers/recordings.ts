import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function recordingObjectExists(key: string): Promise<boolean> {
  const client = new S3Client({
    endpoint: Bun.env.R2_ENDPOINT ?? "https://example.r2.cloudflarestorage.com",
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: Bun.env.R2_ACCESS_KEY_ID ?? "test-access-key-id",
      secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY ?? "test-secret-access-key"
    }
  });

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: Bun.env.R2_BUCKET ?? "recs",
        Key: key
      })
    );

    return true;
  } catch {
    return false;
  }
}
