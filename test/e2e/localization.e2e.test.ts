import { describe, expect, it } from "bun:test";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";

describe("localization", () => {
  it("lists languages and bulk upserts values by semantic key", async () => {
    const languagesResponse = await request("/api/languages");

    expect(languagesResponse.status).toBe(200);
    expect(await paginatedItems(languagesResponse)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "en",
          name: "English"
        }),
        expect.objectContaining({
          code: "pt",
          name: "Português"
        })
      ])
    );

    const valueKey = `metric.test-${crypto.randomUUID().slice(0, 8)}`;
    const upsertResponse = await request("/api/values/bulk", {
      method: "POST",
      body: {
        values: [
          {
            value: valueKey,
            language: "en",
            label: "Test metric"
          },
          {
            value: valueKey,
            language: "pt",
            label: "Métrica de teste"
          }
        ]
      }
    });

    expect(upsertResponse.status).toBe(200);
    expect(await upsertResponse.json()).toEqual([
      {
        value: valueKey,
        labels: expect.arrayContaining([
          expect.objectContaining({
            language: expect.objectContaining({
              code: "en"
            }),
            label: "Test metric"
          }),
          expect.objectContaining({
            language: expect.objectContaining({
              code: "pt"
            }),
            label: "Métrica de teste"
          })
        ])
      }
    ]);

    const getResponse = await request(`/api/values/${valueKey}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({
      value: valueKey,
      labels: expect.arrayContaining([
        expect.objectContaining({
          label: "Test metric"
        })
      ])
    });
  });

  it("updates existing labels idempotently and returns 404 for missing values", async () => {
    const valueKey = `metric.update-${crypto.randomUUID().slice(0, 8)}`;
    const firstResponse = await request("/api/values/bulk", {
      method: "POST",
      body: {
        values: [
          {
            value: valueKey,
            language: "en",
            label: "Original label"
          }
        ]
      }
    });
    const secondResponse = await request("/api/values/bulk", {
      method: "POST",
      body: {
        values: [
          {
            value: valueKey,
            language: "en",
            label: "Updated label"
          },
          {
            value: valueKey,
            language: "es",
            label: "Etiqueta"
          }
        ]
      }
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const getResponse = await request(`/api/values/${valueKey}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      value: valueKey,
      labels: expect.arrayContaining([
        expect.objectContaining({
          language: expect.objectContaining({
            code: "en"
          }),
          label: "Updated label"
        }),
        expect.objectContaining({
          language: expect.objectContaining({
            code: "es"
          }),
          label: "Etiqueta"
        })
      ])
    });

    const missingResponse = await request(
      `/api/values/metric.missing-${crypto.randomUUID().slice(0, 8)}`
    );

    expect(missingResponse.status).toBe(404);
  });

  it("rejects invalid value and language input", async () => {
    const invalidResponses = await Promise.all([
      request("/api/values/bulk", {
        method: "POST",
        body: {
          values: [
            {
              value: "Metric.Bad",
              language: "en",
              label: "Bad value"
            }
          ]
        }
      }),
      request("/api/values/bulk", {
        method: "POST",
        body: {
          values: [
            {
              value: "metric.valid",
              language: "EN_us!",
              label: "Bad language"
            }
          ]
        }
      }),
      request("/api/values/bulk", {
        method: "POST",
        body: {
          values: []
        }
      })
    ]);

    for (const response of invalidResponses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR"
        }
      });
    }
  });
});
