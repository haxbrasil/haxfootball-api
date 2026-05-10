const matchPublicIdAlphabet = "abcdefghjkmnpqrstvwxyz23456789";
const matchPublicIdLength = 8;
const defaultMaxPublicIdAttempts = 16;

export async function createUniqueMatchPublicId(
  publicIdExists: (publicId: string) => Promise<boolean>,
  maxAttempts = defaultMaxPublicIdAttempts
): Promise<string | null> {
  const candidatePublicIds = Array.from(
    { length: maxAttempts },
    randomMatchPublicId
  );

  const candidatesWithExistence = await Promise.all(
    candidatePublicIds.map(async (candidatePublicId) => {
      const candidateExists = await publicIdExists(candidatePublicId);
      const candidateIsUnique = !candidateExists;

      return {
        candidatePublicId,
        candidateIsUnique
      };
    })
  );

  const uniqueCandidate = candidatesWithExistence.find(
    (candidate) => candidate.candidateIsUnique
  );

  return uniqueCandidate?.candidatePublicId ?? null;
}

function randomMatchPublicId(): string {
  const randomValues = new Uint8Array(matchPublicIdLength);
  crypto.getRandomValues(randomValues);

  const publicIdCharacters = Array.from(randomValues, toPublicIdCharacter);

  return publicIdCharacters.join("");
}

function toPublicIdCharacter(randomValue: number): string {
  const alphabetIndex = randomValue % matchPublicIdAlphabet.length;

  return matchPublicIdAlphabet[alphabetIndex];
}
