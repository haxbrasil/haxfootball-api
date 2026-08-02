export function areProgramsCompatible<T>(
  actualPrograms: ReadonlySet<T>,
  allowedPrograms: ReadonlySet<T>
): boolean {
  return (
    actualPrograms.size === 0 ||
    allowedPrograms.size === 0 ||
    [...actualPrograms].every((program) => allowedPrograms.has(program))
  );
}
