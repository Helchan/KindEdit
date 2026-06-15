export interface PdfPoint {
  x: number;
  y: number;
}

export type PdfAnnotationType = 'ink' | 'highlight' | 'rect' | 'note';

export interface PdfAnnotation {
  id: string;
  pageNumber: number;
  annotationType: PdfAnnotationType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  lineWidth: number;
  text?: string | null;
  points: PdfPoint[];
  fabricJson?: unknown;
}

export interface PdfOutlineNode {
  id: string;
  title: string;
  pageNumber: number;
  x?: number | null;
  y?: number | null;
  children: PdfOutlineNode[];
  expanded?: boolean;
}

export interface PdfDocumentState {
  outline: PdfOutlineNode[];
  annotations: PdfAnnotation[];
}

export interface PdfOpenResult {
  dataBase64: string;
  pageCount: number;
  encrypted: boolean;
  annotations: PdfAnnotation[];
}

export interface PdfSaveResult {
  pageCount: number;
  annotations: PdfAnnotation[];
}

export const EMPTY_PDF_STATE: PdfDocumentState = {
  outline: [],
  annotations: [],
};

export function parsePdfState(content: string | null | undefined): PdfDocumentState {
  if (!content) return EMPTY_PDF_STATE;
  try {
    const parsed = JSON.parse(content) as Partial<PdfDocumentState>;
    return {
      outline: Array.isArray(parsed.outline) ? parsed.outline : [],
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
    };
  } catch {
    return EMPTY_PDF_STATE;
  }
}

export function serializePdfState(state: PdfDocumentState): string {
  return JSON.stringify({
    outline: state.outline,
    annotations: state.annotations,
  });
}
