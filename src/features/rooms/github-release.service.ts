import { env } from "@/config/env";
import type { RoomProgramReleaseSource } from "@/features/rooms/room.db";

export type GitHubRelease = {
  id: string;
  tagName: string;
  prerelease: boolean;
  draft: boolean;
  publishedAt: string;
  assets: Array<{
    name: string;
    downloadUrl: string;
  }>;
};

type GitHubApiRelease = {
  id: number | string;
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

export async function listGithubReleases(input: RoomProgramReleaseSource) {
  const response = await fetch(
    `${env.roomGithubApiBaseUrl}/repos/${input.owner}/${input.repo}/releases`,
    {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "haxfootball-api"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub release discovery failed: ${response.status}`);
  }

  // GitHub owns this response shape; keep validation at our API boundary.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const releases: GitHubApiRelease[] = await response.json();

  return releases.map((release) => ({
    id: String(release.id),
    tagName: release.tag_name,
    prerelease: release.prerelease,
    draft: release.draft,
    publishedAt: release.published_at,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url
    }))
  }));
}
