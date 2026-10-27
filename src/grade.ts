export function sortLetters(labels: string[]): string[] {
  return [...new Set(labels)].sort();
}

export function grade(selected: string[], answer: string[]) {
  const normalizedAnswer = sortLetters(answer);
  return {
    canGrade: normalizedAnswer.length > 0,
    correct:
      normalizedAnswer.length > 0 &&
      sortLetters(selected).join('') === normalizedAnswer.join(''),
  };
}
