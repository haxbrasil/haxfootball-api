import { setupTestDatabase } from "@/test/e2e/helpers/helpers";

export async function runRoomReconciliationJob(): Promise<void> {
  await runRoomReconciliationJobForTest();
}

export async function runRoomReconciliationJobForTest(): Promise<string> {
  await setupTestDatabase();

  const { enqueueKnownJob, roomReconcileJobType, runQueuedJob } = await import(
    "@/features/jobs/job.service"
  );
  const job = await enqueueKnownJob({ type: roomReconcileJobType });
  const completed = await runQueuedJob({
    uuid: job.uuid,
    runnerId: "e2e"
  });

  if (completed?.uuid === job.uuid) {
    return job.uuid;
  }

  throw new Error(`Reconciliation job ${job.uuid} was not executed`);
}

export async function enqueueRoomReconciliationJobForTest(): Promise<string> {
  await setupTestDatabase();

  const { enqueueKnownJob, roomReconcileJobType } = await import(
    "@/features/jobs/job.service"
  );
  const job = await enqueueKnownJob({ type: roomReconcileJobType });

  return job.uuid;
}

export async function ensureJobScheduleForTest(): Promise<string> {
  await setupTestDatabase();

  const { ensureConfiguredJobSchedules, roomReconcileJobType } = await import(
    "@/features/jobs/job.service"
  );
  const { getJobScheduleByUuid, listJobScheduleRows } = await import(
    "@/features/jobs/job.persistence"
  );

  await ensureConfiguredJobSchedules();

  const schedule = (await listJobScheduleRows()).find(
    (row) => row.type === roomReconcileJobType
  );

  if (!schedule) {
    throw new Error("Expected room reconciliation schedule to exist");
  }

  return (await getJobScheduleByUuid(schedule.uuid)).uuid;
}
