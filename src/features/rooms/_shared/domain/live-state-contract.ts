import { isJsonObject, toJsonValueSchema, type JsonValue } from "@lib";
import type { RoomProgramLiveStateContract } from "@/features/rooms/db";
import { badRequest } from "@/shared/http/errors";

const namespacePattern = /^[a-z][a-z0-9.-]{0,79}$/;
const documentNamePattern = /^[a-z][a-z0-9-]{0,63}$/;
const factKeyPattern = /^[a-z][a-z0-9.-]{0,127}$/;

export function normalizeLiveStateContract(
  contract: RoomProgramLiveStateContract | null | undefined
): RoomProgramLiveStateContract | null {
  if (contract === undefined || contract === null) {
    return null;
  }

  assertLiveStateContract(contract);

  return {
    namespace: contract.namespace,
    documents: contract.documents.map((document) => ({
      name: document.name,
      version: document.version,
      schema: document.schema
    })),
    facts: contract.facts.map((fact) => ({ ...fact }))
  };
}

export function assertLiveStateContract(
  contract: RoomProgramLiveStateContract
): void {
  if (!namespacePattern.test(contract.namespace)) {
    throw badRequest("Live state namespace is invalid");
  }

  const documentNames = new Set<string>();

  for (const document of contract.documents) {
    if (!documentNamePattern.test(document.name)) {
      throw badRequest("Live state document name is invalid");
    }

    if (documentNames.has(document.name)) {
      throw badRequest("Live state document names must be unique");
    }

    if (!Number.isInteger(document.version) || document.version < 1) {
      throw badRequest(
        "Live state document version must be a positive integer"
      );
    }

    if (!isJsonObject(document.schema) || !toJsonValueSchema(document.schema)) {
      throw badRequest("Live state document schema is invalid");
    }

    documentNames.add(document.name);
  }

  const factKeys = new Set<string>();

  for (const fact of contract.facts) {
    if (!factKeyPattern.test(fact.key)) {
      throw badRequest("Live state fact key is invalid");
    }

    if (factKeys.has(fact.key)) {
      throw badRequest("Live state fact keys must be unique");
    }

    if (!documentNames.has(fact.document)) {
      throw badRequest("Live state fact references an unknown document");
    }

    if (!isJsonPointer(fact.pointer)) {
      throw badRequest("Live state fact pointer is invalid");
    }

    factKeys.add(fact.key);
  }
}

export function readJsonPointer(
  value: JsonValue,
  pointer: string
): JsonValue | undefined {
  if (pointer === "") {
    return value;
  }

  if (!isJsonPointer(pointer)) {
    return undefined;
  }

  let current: JsonValue | undefined = value;

  for (const segment of pointer
    .slice(1)
    .split("/")
    .map((item) => item.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) {
        return undefined;
      }

      current = current[Number(segment)];
      continue;
    }

    if (current && typeof current === "object") {
      current = current[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

function isJsonPointer(value: string): boolean {
  return (
    value === "" || /^\/(?:[^~/]|~0|~1)*(?:\/(?:[^~/]|~0|~1)*)*$/.test(value)
  );
}
