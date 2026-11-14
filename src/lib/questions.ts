/** "Ask each other" — light, warm conversation cards for two. Original prompts. */
export const QUESTIONS: string[] = [
  "What's a small thing I do that makes your day better?",
  "If we could teleport anywhere for dinner tonight, where would we go?",
  "What film would you rewatch with me a hundred times?",
  "What's a memory of us you replay when you miss me?",
  "Which song should be the soundtrack to our story?",
  "What's something new you'd like us to try together this year?",
  "What did you think the very first time we talked?",
  "What's your perfect lazy Sunday with me?",
  "If our life was a movie, what genre would it be?",
  "What's a place from your childhood you'd love to show me?",
  "What's the best gift you've ever received — and why?",
  "Which character from tonight's film are you most like?",
  "What's one thing on your bucket list I don't know about?",
  "What tiny habit of mine secretly makes you smile?",
  "What would our dream home look like?",
  "What's a food you could eat every day for a month?",
  "Who would play us in a movie about our life?",
  "What's something you're proud of this week?",
  "If we had a free weekend and no budget, what would we do?",
  "What's the funniest thing that's happened to us?",
  "What's a skill you'd love to learn together?",
  "Which season feels most like 'us'?",
  "What's a compliment you've never told me but think often?",
  "What's your idea of a perfect date night?",
  "What's one thing you'd like more of in our time together?",
  "If you could relive one day with me, which one?",
  "What's a book or show that changed how you see the world?",
  "What's something that always calms you down?",
  "What's your favourite way to say 'I love you' without words?",
  "Which trip of ours would you take again tomorrow?",
  "What did you want to be when you grew up?",
  "What's a tradition we should start?",
  "What's the best advice anyone ever gave you?",
  "What's a song that instantly takes you back somewhere?",
  "What would you name our pet?",
  "What's something you'd like me to know about your day today?",
  "What's your comfort film — and what makes it so cosy?",
  "What's a little adventure we could have next weekend?",
  "What do you think we'll laugh about in ten years?",
  "What's one thing you'd never change about us?",
];

/** A random question index different from the current one. */
export function nextQuestion(current: number | null, rand = Math.random): number {
  if (QUESTIONS.length < 2) return 0;
  let i = Math.floor(rand() * QUESTIONS.length);
  if (i === current) i = (i + 1) % QUESTIONS.length;
  return i;
}
