import { describe, expect, it } from "vitest";
import { nextQuestion, QUESTIONS } from "@/lib/questions";

describe("question cards", () => {
  it("has a healthy, unique deck", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(QUESTIONS).size).toBe(QUESTIONS.length);
  });
  it("never repeats the card that's showing", () => {
    for (let i = 0; i < QUESTIONS.length; i++) {
      const fixed = () => i / QUESTIONS.length; // would pick i again
      expect(nextQuestion(i, fixed)).not.toBe(i);
    }
    expect(nextQuestion(null, () => 0)).toBe(0);
  });
});
