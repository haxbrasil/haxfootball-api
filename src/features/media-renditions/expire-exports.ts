import {
  expireMediaRendition,
  listExpiredExportRenditions
} from "@/features/media-renditions/_shared/db/queries";
import { deleteR2Object } from "@/shared/storage/r2";

export async function purgeExpiredClipExports(): Promise<number> {
  const expired = await listExpiredExportRenditions();
  let purged = 0;
  for (const rendition of expired) {
    try {
      if (rendition.objectKey) {
        await deleteR2Object(rendition.objectKey);
      }
      if (await expireMediaRendition(rendition)) purged += 1;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "media_exports.expiration_failed",
          renditionId: rendition.uuid,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }
  return purged;
}
