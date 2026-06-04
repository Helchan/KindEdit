import { editor, Range } from 'monaco-editor';

const MAX_GROUPS = 8;
const MAX_MATCHES_PER_GROUP = 2000;

type HighlightGroup = {
  query: string;
  className: string;
};

export class AdditiveSelectionHighlighter {
  private readonly decorations: editor.IEditorDecorationsCollection;
  private readonly groups: HighlightGroup[] = [];

  constructor(private readonly editorInstance: editor.IStandaloneCodeEditor) {
    this.decorations = editorInstance.createDecorationsCollection();
  }

  addQuery(query: string) {
    const normalizedQuery = query.replace(/\r\n/g, '\n');
    if (!normalizedQuery || !normalizedQuery.trim()) return;

    const existingIndex = this.groups.findIndex((group) => group.query === normalizedQuery);
    if (existingIndex >= 0) {
      const [existing] = this.groups.splice(existingIndex, 1);
      this.groups.push(existing);
      this.refresh();
      return;
    }

    const className = `kindedit-additive-selection-${this.groups.length % MAX_GROUPS}`;
    this.groups.push({ query: normalizedQuery, className });

    if (this.groups.length > MAX_GROUPS) {
      this.groups.shift();
    }

    this.refresh();
  }

  clear() {
    this.groups.length = 0;
    this.decorations.clear();
  }

  refresh() {
    const model = this.editorInstance.getModel();
    if (!model) {
      this.decorations.clear();
      return;
    }

    const nextDecorations: editor.IModelDeltaDecoration[] = [];

    for (const group of this.groups) {
      const matches = model.findMatches(
        group.query,
        true,
        false,
        true,
        null,
        false,
        MAX_MATCHES_PER_GROUP
      );

      for (const match of matches) {
        if (Range.isEmpty(match.range)) continue;
        nextDecorations.push({
          range: match.range,
          options: {
            inlineClassName: group.className,
            stickiness: editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
    }

    this.decorations.set(nextDecorations);
  }

  dispose() {
    this.decorations.clear();
  }
}
