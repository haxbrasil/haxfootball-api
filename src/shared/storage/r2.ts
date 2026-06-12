import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/config/env";

type PutR2ObjectInput = {
  body: Uint8Array;
  contentEncoding?: string;
  contentType: string;
  key: string;
};

const r2Client = new S3Client({
  endpoint: env.r2Endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey
  }
});

export async function putR2Object(input: PutR2ObjectInput): Promise<void> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ...(input.contentEncoding
        ? { ContentEncoding: input.contentEncoding }
        : {})
    })
  );
}

export function r2PublicUrl(key: string): string {
  return `${env.r2PublicBaseUrl.replace(/\/+$/, "")}/${key}`;
}
