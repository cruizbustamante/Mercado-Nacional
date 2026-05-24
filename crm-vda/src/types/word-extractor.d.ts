declare module "word-extractor" {
  class Document {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
    getFooters(): string;
    getEndnotes(): string;
    getAnnotations(): string;
  }
  class WordExtractor {
    extract(input: string | Buffer): Promise<Document>;
  }
  export default WordExtractor;
}
