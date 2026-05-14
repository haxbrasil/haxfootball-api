export function normalizeOpenApiDocument(document: unknown): unknown {
  const documentWithNestedRefs = replaceNestedComponentSchemas(document);
  const documentWithoutInternalIds = stripInternalSchemaIds(
    documentWithNestedRefs
  );
  const documentWithNarrowContentTypes = normalizeContentTypes(
    documentWithoutInternalIds
  );

  return sortKeys(documentWithNarrowContentTypes);
}

function replaceNestedComponentSchemas(document: unknown): unknown {
  if (!isRecord(document)) {
    return document;
  }

  const componentRefs = collectComponentRefs(document);
  const components = recordValue(document.components);
  const schemas = recordValue(components.schemas);
  const nextDocument = replaceComponentSchemaRefs({
    value: document,
    componentRefs,
    replaceCurrent: false
  });
  const nextSchemas = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      replaceComponentSchemaRefs({
        value: schema,
        componentRefs,
        replaceCurrent: false
      })
    ])
  );

  return {
    ...recordValue(nextDocument),
    components: {
      ...components,
      schemas: nextSchemas
    }
  };
}

function collectComponentRefs(document: Record<string, unknown>): Set<string> {
  const components = recordValue(document.components);
  const schemas = recordValue(components.schemas);
  const refs = Object.keys(schemas).map(
    (name) => `#/components/schemas/${name}`
  );

  return new Set(refs);
}

function replaceComponentSchemaRefs(input: {
  value: unknown;
  componentRefs: Set<string>;
  replaceCurrent: boolean;
}): unknown {
  const { value, componentRefs, replaceCurrent } = input;

  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceComponentSchemaRefs({
        value: item,
        componentRefs,
        replaceCurrent: true
      })
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const componentRef =
    typeof value.$id === "string" && componentRefs.has(value.$id)
      ? value.$id
      : null;

  if (replaceCurrent && componentRef) {
    return { $ref: componentRef };
  }

  return mapRecord(value, (nestedValue) =>
    replaceComponentSchemaRefs({
      value: nestedValue,
      componentRefs,
      replaceCurrent: true
    })
  );
}

function stripInternalSchemaIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripInternalSchemaIds);
  }

  if (!isRecord(value)) {
    return value;
  }

  const entriesWithoutInternalIds = Object.entries(value).filter(
    ([key]) => key !== "$id"
  );
  const nestedEntries = entriesWithoutInternalIds.map(([key, nestedValue]) => [
    key,
    stripInternalSchemaIds(nestedValue)
  ]);

  return Object.fromEntries(nestedEntries);
}

function normalizeContentTypes(document: unknown): unknown {
  if (!isRecord(document) || !isRecord(document.paths)) {
    return document;
  }

  const binaryComponentRefs = findBinaryComponentRefs(document);
  const paths = mapRecord(document.paths, (pathItem) =>
    normalizePathItemContentTypes(pathItem, binaryComponentRefs)
  );

  return {
    ...document,
    paths
  };
}

function normalizePathItemContentTypes(
  pathItem: unknown,
  binaryComponentRefs: Set<string>
): unknown {
  if (!isRecord(pathItem)) {
    return pathItem;
  }

  return mapRecord(pathItem, (operation) =>
    normalizeOperationContentTypes(operation, binaryComponentRefs)
  );
}

function normalizeOperationContentTypes(
  operation: unknown,
  binaryComponentRefs: Set<string>
): unknown {
  if (!isRecord(operation)) {
    return operation;
  }

  const requestBody = isRecord(operation.requestBody)
    ? normalizeRequestBodyContent(operation.requestBody, binaryComponentRefs)
    : operation.requestBody;
  const responses = isRecord(operation.responses)
    ? mapRecord(operation.responses, keepOnlyJsonContent)
    : operation.responses;

  return {
    ...operation,
    requestBody,
    responses
  };
}

function normalizeRequestBodyContent(
  requestBody: Record<string, unknown>,
  binaryComponentRefs: Set<string>
): unknown {
  if (!isRecord(requestBody.content)) {
    return requestBody;
  }

  const multipart = requestBody.content["multipart/form-data"];
  const json = requestBody.content["application/json"];
  const content = hasBinarySchema(multipart, binaryComponentRefs)
    ? { "multipart/form-data": multipart }
    : { "application/json": json };

  return {
    ...requestBody,
    content
  };
}

function keepOnlyJsonContent(response: unknown): unknown {
  if (!isRecord(response) || !isRecord(response.content)) {
    return response;
  }

  return {
    ...response,
    content: {
      "application/json": response.content["application/json"]
    }
  };
}

function findBinaryComponentRefs(
  document: Record<string, unknown>
): Set<string> {
  const components = recordValue(document.components);
  const schemas = recordValue(components.schemas);
  const refs = new Set<string>();

  for (const [name, schema] of Object.entries(schemas)) {
    if (hasBinarySchema(schema, refs)) {
      refs.add(`#/components/schemas/${name}`);
    }
  }

  return refs;
}

function hasBinarySchema(
  value: unknown,
  binaryComponentRefs: Set<string>
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasBinarySchema(item, binaryComponentRefs));
  }

  if (!isRecord(value)) {
    return false;
  }

  const isBinary = value.format === "binary";
  const isBinaryRef =
    typeof value.$ref === "string" && binaryComponentRefs.has(value.$ref);
  const hasNestedBinary = Object.values(value).some((nestedValue) =>
    hasBinarySchema(nestedValue, binaryComponentRefs)
  );

  return isBinary || isBinaryRef || hasNestedBinary;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (!isRecord(value)) {
    return value;
  }

  const sortedEntries = Object.entries(value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, nestedValue]) => [key, sortKeys(nestedValue)]);

  return Object.fromEntries(sortedEntries);
}

function mapRecord(
  value: Record<string, unknown>,
  mapper: (value: unknown, key: string) => unknown
): Record<string, unknown> {
  const entries = Object.entries(value).map(([key, nestedValue]) => [
    key,
    mapper(nestedValue, key)
  ]);

  return Object.fromEntries(entries);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
