declare module "sentiment" {
  type AnalyzeResult = {
    score: number;
    comparative: number;
    words: string[];
    positive: string[];
    negative: string[];
    tokens?: string[];
    calculation?: Array<Record<string, number>>;
  };

  export default class Sentiment {
    constructor(options?: unknown);
    analyze(text: string): AnalyzeResult;
  }
}


