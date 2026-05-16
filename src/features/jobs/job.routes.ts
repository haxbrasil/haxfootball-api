import { Elysia, t } from "elysia";
import { getJob, jobResponseSchema } from "@/features/jobs/get-job";
import {
  getJobSchedule,
  jobScheduleResponseSchema
} from "@/features/jobs/get-job-schedule";
import { jobIdParamsSchema } from "@/features/jobs/job.contract";
import {
  listJobSchedules,
  listJobSchedulesResponseSchema
} from "@/features/jobs/list-job-schedules";
import { listJobs, listJobsResponseSchema } from "@/features/jobs/list-jobs";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const jobRoutes = new Elysia({
  name: "job-routes"
})
  .model({
    Job: jobResponseSchema,
    JobSchedule: jobScheduleResponseSchema,
    ListJobs: listJobsResponseSchema,
    ListJobSchedules: listJobSchedulesResponseSchema,
    NotFoundError: notFoundErrorResponseSchema
  })
  .group("/jobs", (app) =>
    app
      .get("", ({ query }) => listJobs(query), {
        query: paginationQuerySchema,
        response: {
          200: t.Ref("ListJobs")
        },
        detail: {
          tags: ["Jobs"],
          summary: "List jobs"
        }
      })
      .get("/:id", ({ params }) => getJob(params.id), {
        params: jobIdParamsSchema,
        response: {
          200: t.Ref("Job"),
          404: t.Ref("NotFoundError")
        },
        detail: {
          tags: ["Jobs"],
          summary: "Get job"
        }
      })
  )
  .group("/job-schedules", (app) =>
    app
      .get("", ({ query }) => listJobSchedules(query), {
        query: paginationQuerySchema,
        response: {
          200: t.Ref("ListJobSchedules")
        },
        detail: {
          tags: ["Jobs"],
          summary: "List job schedules"
        }
      })
      .get("/:id", ({ params }) => getJobSchedule(params.id), {
        params: jobIdParamsSchema,
        response: {
          200: t.Ref("JobSchedule"),
          404: t.Ref("NotFoundError")
        },
        detail: {
          tags: ["Jobs"],
          summary: "Get job schedule"
        }
      })
  );
