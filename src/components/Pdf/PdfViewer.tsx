import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type WheelEvent } from 'react';
import {
  Canvas as FabricCanvas,
  Path as FabricPath,
  PencilBrush,
  Rect,
  Textbox,
} from 'fabric';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

import Resizer from '../TreeView/Resizer';
import PdfOutlineView from './PdfOutlineView';
import type { PdfAnnotation, PdfAnnotationType, PdfDocumentState, PdfOutlineNode, PdfPoint } from '../../types/pdf';

import './PdfViewer.css';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfTool = 'select' | 'ink' | 'highlight' | 'rect' | 'note';
const PDFJS_ASSET_BASE_URL = '/pdfjs/';
const PDF_RENDER_WINDOW_RADIUS = 1;
const PDF_MIN_SCALE = 0.5;
const PDF_MAX_SCALE = 2.5;
const PDF_SCALE_STEP = 0.1;

export interface PdfViewerHandle {
  getState: () => PdfDocumentState;
  getPassword: () => string | null;
}

interface PdfViewerProps {
  tabId: string;
  dataBase64: string;
  password?: string | null;
  initialState: PdfDocumentState;
  treeFontSize: number;
  sidebarRatio: number;
  theme: 'light' | 'dark';
  onStateChange: (state: PdfDocumentState, dirty: boolean) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onResizeSidebar?: (deltaX: number) => void;
  onStatusChange?: (message: string, isError?: boolean) => void;
}

interface PdfOutlineRawNode {
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineRawNode[];
}

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clonePdfState(state: PdfDocumentState): PdfDocumentState {
  return {
    outline: JSON.parse(JSON.stringify(state.outline)) as PdfOutlineNode[],
    annotations: JSON.parse(JSON.stringify(state.annotations)) as PdfAnnotation[],
  };
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRenderingCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

function resetCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.width = '';
  canvas.style.height = '';
}

function clampPdfScale(scale: number): number {
  return Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, Number(scale.toFixed(2))));
}

function cleanupPdfPage(page: PDFPageProxy | null) {
  if (!page) return;
  try {
    page.cleanup();
  } catch {
    // PDF.js can reject cleanup while a render task is still settling.
  }
}

function detachFabricDom(fabric: FabricCanvas, host: HTMLDivElement | null) {
  if (!host) return;
  const elements = (fabric as unknown as {
    elements?: {
      container?: HTMLElement;
      lower?: { el?: HTMLCanvasElement };
    };
  }).elements;
  const container = elements?.container;
  if (container?.parentNode === host) {
    host.removeChild(container);
    return;
  }
  const lowerCanvas = elements?.lower?.el;
  if (lowerCanvas?.parentNode === host) {
    host.removeChild(lowerCanvas);
  }
}

function disposeFabricCanvas(fabric: FabricCanvas | null, host: HTMLDivElement | null = null) {
  if (!fabric) return;
  detachFabricDom(fabric, host);
  fabric.dispose().catch(() => {});
}

async function outlineDestinationToPage(
  pdf: PDFDocumentProxy,
  dest: string | unknown[] | null
): Promise<{ pageNumber: number; x?: number | null; y?: number | null }> {
  let explicitDest: unknown[] | null = null;
  if (typeof dest === 'string') {
    explicitDest = await pdf.getDestination(dest);
  } else if (Array.isArray(dest)) {
    explicitDest = dest;
  }

  if (!explicitDest || explicitDest.length === 0) {
    return { pageNumber: 1, x: null, y: null };
  }

  const pageRef = explicitDest[0] as { num?: number; gen?: number } | number;
  let pageNumber = 1;
  if (typeof pageRef === 'number') {
    pageNumber = pageRef + 1;
  } else if (pageRef && typeof pageRef === 'object') {
    try {
      pageNumber = (await pdf.getPageIndex(pageRef as { num: number; gen: number })) + 1;
    } catch {
      pageNumber = 1;
    }
  }

  return {
    pageNumber,
    x: typeof explicitDest[2] === 'number' ? explicitDest[2] as number : null,
    y: typeof explicitDest[3] === 'number' ? explicitDest[3] as number : null,
  };
}

async function normalizeOutline(pdf: PDFDocumentProxy, nodes: PdfOutlineRawNode[]): Promise<PdfOutlineNode[]> {
  const result: PdfOutlineNode[] = [];
  for (const node of nodes) {
    const destination = await outlineDestinationToPage(pdf, node.dest);
    result.push({
      id: createId('pdf-outline'),
      title: node.title || '未命名书签',
      pageNumber: destination.pageNumber,
      x: destination.x,
      y: destination.y,
      expanded: true,
      children: await normalizeOutline(pdf, node.items || []),
    });
  }
  return result;
}

function annotationsForPage(annotations: PdfAnnotation[], pageNumber: number): PdfAnnotation[] {
  return annotations.filter((annotation) => annotation.pageNumber === pageNumber);
}

function updatePageAnnotations(
  annotations: PdfAnnotation[],
  pageNumber: number,
  nextPageAnnotations: PdfAnnotation[]
): PdfAnnotation[] {
  return [
    ...annotations.filter((annotation) => annotation.pageNumber !== pageNumber),
    ...nextPageAnnotations,
  ];
}

const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({
  dataBase64,
  password,
  initialState,
  treeFontSize,
  sidebarRatio,
  theme,
  onStateChange,
  onFontSizeChange,
  onResizeSidebar,
  onStatusChange,
}, ref) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [tool, setTool] = useState<PdfTool>('select');
  const [color, setColor] = useState('#f4c542');
  const [currentPage, setCurrentPage] = useState(1);
  const [state, setState] = useState<PdfDocumentState>(() => clonePdfState(initialState));
  const stateRef = useRef(state);
  const passwordRef = useRef(password ?? null);
  const onStateChangeRef = useRef(onStateChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const currentPageRef = useRef(1);
  const visiblePageFrameRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    passwordRef.current = password ?? null;
  }, [password]);

  useImperativeHandle(ref, () => ({
    getState: () => stateRef.current,
    getPassword: () => passwordRef.current,
  }), []);

  const updateState = useCallback((nextState: PdfDocumentState, dirty: boolean) => {
    stateRef.current = nextState;
    setState(nextState);
    onStateChangeRef.current(nextState, dirty);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;

    async function loadPdf() {
      try {
        setPdf(null);
        setPageCount(0);
        const data = decodeBase64(dataBase64);
        loadingTask = getDocument({
          data,
          password: password || undefined,
          cMapUrl: `${PDFJS_ASSET_BASE_URL}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_ASSET_BASE_URL}standard_fonts/`,
          wasmUrl: `${PDFJS_ASSET_BASE_URL}wasm/`,
          useWasm: true,
          useWorkerFetch: false,
          isOffscreenCanvasSupported: false,
          isImageDecoderSupported: false,
          maxImageSize: -1,
        });
        const loadedPdf = await loadingTask.promise;
        if (cancelled) {
          await (loadedPdf as { destroy?: () => Promise<void> }).destroy?.();
          return;
        }
        setPdf(loadedPdf);
        setPageCount(loadedPdf.numPages);
        currentPageRef.current = 1;
        setCurrentPage(1);
        onStatusChangeRef.current?.(`PDF：1/${loadedPdf.numPages}`);

        if (stateRef.current.outline.length === 0) {
          const rawOutline = await loadedPdf.getOutline();
          if (!cancelled && rawOutline?.length) {
            const outline = await normalizeOutline(loadedPdf, rawOutline as PdfOutlineRawNode[]);
            updateState({ ...stateRef.current, outline }, false);
          }
        }
      } catch (error) {
        if (!cancelled) {
          onStatusChangeRef.current?.(String(error), true);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [dataBase64, password, updateState]);

  const pageNumbers = useMemo(() => (
    Array.from({ length: pageCount }, (_, index) => index + 1)
  ), [pageCount]);

  const updateVisiblePage = useCallback(() => {
    const scroller = pagesContainerRef.current;
    if (!scroller || pageRefs.current.size === 0 || pageCount === 0) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const probeTop = scrollerRect.top + 48;
    const pages = [...pageRefs.current.entries()].sort(([left], [right]) => left - right);

    let nextPage = currentPageRef.current;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [pageNumber, element] of pages) {
      const rect = element.getBoundingClientRect();
      if (rect.top <= probeTop && rect.bottom > probeTop) {
        nextPage = pageNumber;
        nearestDistance = 0;
        break;
      }

      const distance = Math.abs(rect.top - probeTop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nextPage = pageNumber;
      }
    }

    if (nextPage !== currentPageRef.current) {
      currentPageRef.current = nextPage;
      setCurrentPage(nextPage);
      onStatusChangeRef.current?.(`PDF：${nextPage}/${pageCount}`);
    }
  }, [pageCount]);

  const scheduleVisiblePageUpdate = useCallback(() => {
    if (visiblePageFrameRef.current !== null) return;
    visiblePageFrameRef.current = window.requestAnimationFrame(() => {
      visiblePageFrameRef.current = null;
      updateVisiblePage();
    });
  }, [updateVisiblePage]);

  useEffect(() => () => {
    if (visiblePageFrameRef.current !== null) {
      window.cancelAnimationFrame(visiblePageFrameRef.current);
    }
  }, []);

  useEffect(() => {
    scheduleVisiblePageUpdate();
  }, [pageCount, scale, scheduleVisiblePageUpdate]);

  const registerPageRef = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNumber, element);
      scheduleVisiblePageUpdate();
    } else {
      pageRefs.current.delete(pageNumber);
    }
  }, [scheduleVisiblePageUpdate]);

  const handleJumpToPage = useCallback((pageNumber: number, y?: number | null) => {
    const target = pageRefs.current.get(pageNumber);
    if (!target) return;

    const scroller = pagesContainerRef.current ?? target.closest('.pdf-pages') as HTMLElement | null;
    if (scroller) {
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const pageTop = scroller.scrollTop + targetRect.top - scrollerRect.top;
      const pageOffset = typeof y === 'number' ? Math.max(0, y * scale - 48) : 0;

      currentPageRef.current = pageNumber;
      setCurrentPage(pageNumber);
      onStatusChangeRef.current?.(`PDF：${pageNumber}/${pageCount}`);
      scroller.scrollTo({
        top: pageTop + pageOffset,
        behavior: 'smooth',
      });
      return;
    }

    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [pageCount, scale]);

  const handleOutlineChange = useCallback((outline: PdfOutlineNode[]) => {
    updateState({ ...stateRef.current, outline }, true);
  }, [updateState]);

  const handlePageAnnotationsChange = useCallback((pageNumber: number, nextAnnotations: PdfAnnotation[]) => {
    const nextState = {
      ...stateRef.current,
      annotations: updatePageAnnotations(stateRef.current.annotations, pageNumber, nextAnnotations),
    };
    updateState(nextState, true);
  }, [updateState]);

  const handlePageRenderError = useCallback((pageNumber: number, error: unknown) => {
    onStatusChangeRef.current?.(`PDF 第 ${pageNumber} 页渲染失败：${formatErrorMessage(error)}`, true);
  }, []);

  const updatePdfScale = useCallback((direction: 1 | -1, anchor?: { x: number; y: number }) => {
    const scroller = pagesContainerRef.current;
    const rect = scroller?.getBoundingClientRect();
    const anchorOffset = scroller && rect && anchor
      ? {
          x: anchor.x - rect.left,
          y: anchor.y - rect.top,
        }
      : null;

    setScale((currentScale) => {
      const nextScale = clampPdfScale(currentScale + direction * PDF_SCALE_STEP);
      if (nextScale === currentScale) return currentScale;

      if (scroller && anchorOffset) {
        const contentX = (scroller.scrollLeft + anchorOffset.x) / currentScale;
        const contentY = (scroller.scrollTop + anchorOffset.y) / currentScale;

        window.requestAnimationFrame(() => {
          scroller.scrollLeft = Math.max(0, contentX * nextScale - anchorOffset.x);
          scroller.scrollTop = Math.max(0, contentY * nextScale - anchorOffset.y);
          scheduleVisiblePageUpdate();
        });
      }

      onStatusChangeRef.current?.(`PDF 缩放：${Math.round(nextScale * 100)}%`);
      return nextScale;
    });
  }, [scheduleVisiblePageUpdate]);

  const handlePagesWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;

    event.preventDefault();
    event.stopPropagation();
    updatePdfScale(event.deltaY < 0 ? 1 : -1, { x: event.clientX, y: event.clientY });
  }, [updatePdfScale]);

  return (
    <>
      <div className="pdf-sidebar" style={{ width: `${sidebarRatio * 100}%` }}>
        <PdfOutlineView
          nodes={state.outline}
          currentPage={currentPage}
          fontSize={treeFontSize}
          onJumpToPage={handleJumpToPage}
          onChange={handleOutlineChange}
          onFontSizeChange={onFontSizeChange}
        />
      </div>
      {onResizeSidebar ? <Resizer onResize={onResizeSidebar} /> : <div className="pdf-resizer-spacer" />}
      <div className="pdf-viewer">
        <div className="pdf-toolbar">
          <div className="pdf-tool-group">
            <button className={`pdf-tool-button${tool === 'select' ? ' active' : ''}`} title="选择" onClick={() => setTool('select')}>↖</button>
            <button className={`pdf-tool-button${tool === 'ink' ? ' active' : ''}`} title="手写" onClick={() => setTool('ink')}>✎</button>
            <button className={`pdf-tool-button${tool === 'highlight' ? ' active' : ''}`} title="高亮" onClick={() => setTool('highlight')}>▰</button>
            <button className={`pdf-tool-button${tool === 'rect' ? ' active' : ''}`} title="矩形" onClick={() => setTool('rect')}>□</button>
            <button className={`pdf-tool-button${tool === 'note' ? ' active' : ''}`} title="备注" onClick={() => setTool('note')}>T</button>
          </div>
          <div className="pdf-tool-group">
            {['#f4c542', '#e06c75', '#61afef', '#98c379', '#c678dd'].map((swatch) => (
              <button
                key={swatch}
                className={`pdf-color-swatch${color === swatch ? ' active' : ''}`}
                title={swatch}
                style={{ background: swatch }}
                onClick={() => setColor(swatch)}
              />
            ))}
          </div>
          <div className="pdf-tool-group">
            <button className="pdf-tool-button" title="缩小" onClick={() => updatePdfScale(-1)}>−</button>
            <span className="pdf-scale-label">{Math.round(scale * 100)}%</span>
            <button className="pdf-tool-button" title="放大" onClick={() => updatePdfScale(1)}>+</button>
          </div>
        </div>
        <div
          ref={pagesContainerRef}
          className={`pdf-pages ${theme === 'dark' ? 'dark' : 'light'}`}
          onScroll={scheduleVisiblePageUpdate}
          onWheel={handlePagesWheel}
        >
          {!pdf && <div className="pdf-loading">Loading PDF...</div>}
          {pdf && pageNumbers.map((pageNumber) => (
            <PdfPageView
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              scale={scale}
              tool={tool}
              color={color}
              annotations={annotationsForPage(state.annotations, pageNumber)}
              isRenderActive={Math.abs(pageNumber - currentPage) <= PDF_RENDER_WINDOW_RADIUS}
              onAnnotationsChange={handlePageAnnotationsChange}
              onRenderError={handlePageRenderError}
              registerPageRef={registerPageRef}
            />
          ))}
        </div>
      </div>
    </>
  );
});

interface PdfPageViewProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  tool: PdfTool;
  color: string;
  annotations: PdfAnnotation[];
  isRenderActive: boolean;
  onAnnotationsChange: (pageNumber: number, annotations: PdfAnnotation[]) => void;
  onRenderError: (pageNumber: number, error: unknown) => void;
  registerPageRef: (pageNumber: number, element: HTMLDivElement | null) => void;
}

function PdfPageView({
  pdf,
  pageNumber,
  scale,
  tool,
  color,
  annotations,
  isRenderActive,
  onAnnotationsChange,
  onRenderError,
  registerPageRef,
}: PdfPageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderRunRef = useRef(0);
  const suppressFabricEventsRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number; object: Rect | null } | null>(null);
  const annotationsRef = useRef(annotations);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(() => ({
    width: Math.round(612 * scale),
    height: Math.round(792 * scale),
  }));
  const shouldRender = isRenderActive;

  const releasePageGraphics = useCallback(() => {
    cleanupPdfPage(pageRef.current);
    pageRef.current = null;
    resetCanvas(pdfCanvasRef.current);
    resetCanvas(annotationCanvasRef.current);
  }, []);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    if (pageRef.current) return;
    setPageSize({
      width: Math.round(612 * scale),
      height: Math.round(792 * scale),
    });
  }, [scale]);

  useEffect(() => {
    const element = containerRef.current;
    registerPageRef(pageNumber, element);
    return () => {
      registerPageRef(pageNumber, null);
    };
  }, [pageNumber, registerPageRef]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;
    const renderRun = renderRunRef.current + 1;
    renderRunRef.current = renderRun;

    const releaseCurrentPageGraphics = () => {
      if (renderRunRef.current === renderRun) {
        releasePageGraphics();
      }
    };

    async function renderPage() {
      if (!shouldRender) {
        releaseCurrentPageGraphics();
        return;
      }
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      pageRef.current = page;
      const viewport = page.getViewport({ scale });
      setPageSize({
        width: viewport.width,
        height: viewport.height,
      });
      const pdfCanvas = pdfCanvasRef.current;
      if (!pdfCanvas) return;

      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;
      pdfCanvas.style.width = `${viewport.width}px`;
      pdfCanvas.style.height = `${viewport.height}px`;

      setRenderError(null);
      renderTask = page.render({ canvas: pdfCanvas, viewport, background: 'rgb(255,255,255)' });
      await renderTask.promise;
      cleanupPdfPage(page);
    }

    renderPage().catch((error) => {
      if (cancelled || isRenderingCancelled(error)) return;
      const message = formatErrorMessage(error);
      setRenderError(message);
      onRenderError(pageNumber, error);
    }).finally(() => {
      if (cancelled) {
        releaseCurrentPageGraphics();
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (!renderTask) {
        releaseCurrentPageGraphics();
      }
    };
  }, [onRenderError, pageNumber, pdf, releasePageGraphics, scale, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;
    const annotationLayer = annotationLayerRef.current;
    if (!annotationLayer) return;

    annotationLayer.replaceChildren();
    const canvasElement = document.createElement('canvas');
    canvasElement.className = 'pdf-annotation-canvas';
    annotationLayer.appendChild(canvasElement);
    annotationCanvasRef.current = canvasElement;

    const fabric = new FabricCanvas(canvasElement, {
      selection: true,
      preserveObjectStacking: true,
      containerClass: 'pdf-fabric-container',
    });
    fabric.setDimensions({ width: pageSize.width, height: pageSize.height });
    fabricRef.current = fabric;

    const emitChange = () => {
      if (suppressFabricEventsRef.current) return;
      onAnnotationsChange(pageNumber, extractAnnotationsFromCanvas(fabric, pageNumber, scale));
    };

    fabric.on('object:modified', emitChange);
    fabric.on('object:removed', emitChange);
    fabric.on('path:created', emitChange);

    return () => {
      disposeFabricCanvas(fabric, annotationLayer);
      fabricRef.current = null;
      if (annotationCanvasRef.current === canvasElement) {
        annotationCanvasRef.current = null;
      }
    };
  }, [onAnnotationsChange, pageNumber, pageSize.height, pageSize.width, scale, shouldRender]);

  useEffect(() => {
    const fabric = fabricRef.current;
    const annotationCanvas = annotationCanvasRef.current;
    if (!fabric || !annotationCanvas) return;

    suppressFabricEventsRef.current = true;
    fabric.clear();
    fabric.setDimensions({ width: annotationCanvas.width, height: annotationCanvas.height });
    annotations.forEach((annotation) => {
      const object = createFabricObject(annotation, scale);
      if (object) fabric.add(object);
    });
    fabric.renderAll();
    suppressFabricEventsRef.current = false;
  }, [annotations, scale, shouldRender]);

  useEffect(() => {
    const fabric = fabricRef.current;
    if (!fabric) return;

    fabric.isDrawingMode = tool === 'ink';
    fabric.selection = tool === 'select';
    fabric.getObjects().forEach((object) => {
      object.selectable = tool === 'select';
      object.evented = tool === 'select';
    });

    if (tool === 'ink') {
      const brush = new PencilBrush(fabric);
      brush.color = color;
      brush.width = 2;
      fabric.freeDrawingBrush = brush;
    }

    const handleMouseDown = (event: unknown) => {
      if (tool !== 'highlight' && tool !== 'rect' && tool !== 'note') return;
      const pointer = getFabricPointer(event);
      if (!pointer) return;

      if (tool === 'note') {
        const note = new Textbox('备注', {
          left: pointer.x,
          top: pointer.y,
          width: 120,
          fontSize: 14,
          fill: color,
          backgroundColor: 'rgba(255,255,255,0.72)',
        });
        attachAnnotationMetadata(note, 'note', pageNumber);
        fabric.add(note);
        fabric.setActiveObject(note);
        onAnnotationsChange(pageNumber, extractAnnotationsFromCanvas(fabric, pageNumber, scale));
        return;
      }

      const rect = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 1,
        height: 1,
        fill: tool === 'highlight' ? hexToRgba(color, 0.32) : 'transparent',
        stroke: color,
        strokeWidth: tool === 'highlight' ? 0 : 2,
      });
      attachAnnotationMetadata(rect, tool, pageNumber);
      drawStartRef.current = { x: pointer.x, y: pointer.y, object: rect };
      fabric.add(rect);
    };

    const handleMouseMove = (event: unknown) => {
      const drawing = drawStartRef.current;
      const pointer = getFabricPointer(event);
      if (!drawing?.object || !pointer) return;
      const left = Math.min(drawing.x, pointer.x);
      const top = Math.min(drawing.y, pointer.y);
      drawing.object.set({
        left,
        top,
        width: Math.abs(pointer.x - drawing.x),
        height: Math.abs(pointer.y - drawing.y),
      });
      fabric.renderAll();
    };

    const handleMouseUp = () => {
      const drawing = drawStartRef.current;
      if (!drawing?.object) return;
      drawStartRef.current = null;
      onAnnotationsChange(pageNumber, extractAnnotationsFromCanvas(fabric, pageNumber, scale));
    };

    fabric.on('mouse:down', handleMouseDown);
    fabric.on('mouse:move', handleMouseMove);
    fabric.on('mouse:up', handleMouseUp);

    return () => {
      fabric.off('mouse:down', handleMouseDown);
      fabric.off('mouse:move', handleMouseMove);
      fabric.off('mouse:up', handleMouseUp);
    };
  }, [color, onAnnotationsChange, pageNumber, scale, shouldRender, tool]);

  useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const fabric = fabricRef.current;
      if (!fabric) return;
      const active = fabric.getActiveObjects();
      if (active.length === 0) return;
      active.forEach((object) => fabric.remove(object));
      fabric.discardActiveObject();
      fabric.renderAll();
      onAnnotationsChange(pageNumber, extractAnnotationsFromCanvas(fabric, pageNumber, scale));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAnnotationsChange, pageNumber, scale, shouldRender]);

  return (
    <div className="pdf-page-wrap" ref={containerRef}>
      <div className="pdf-page-label">第 {pageNumber} 页</div>
      <div
        className="pdf-page-canvas-stack"
        style={{ width: pageSize.width, height: pageSize.height }}
      >
        {shouldRender ? (
          <>
            <canvas ref={pdfCanvasRef} className="pdf-page-canvas" />
            <div ref={annotationLayerRef} className="pdf-annotation-layer" />
            {renderError && (
              <div className="pdf-page-render-error">
                第 {pageNumber} 页渲染失败
              </div>
            )}
          </>
        ) : (
          <div className="pdf-page-placeholder">Loading page...</div>
        )}
      </div>
    </div>
  );
}

function attachAnnotationMetadata(object: unknown, annotationType: PdfAnnotationType, pageNumber: number) {
  const target = object as Record<string, unknown>;
  target.kindeditType = annotationType;
  target.kindeditId = createId('pdf-annotation');
  target.pageNumber = pageNumber;
}

function getFabricPointer(event: unknown): { x: number; y: number } | null {
  const record = event as {
    pointer?: { x?: unknown; y?: unknown };
    scenePoint?: { x?: unknown; y?: unknown };
    viewportPoint?: { x?: unknown; y?: unknown };
  };
  const point = record.pointer || record.scenePoint || record.viewportPoint;
  if (typeof point?.x !== 'number' || typeof point.y !== 'number') {
    return null;
  }
  return { x: point.x, y: point.y };
}

function createFabricObject(annotation: PdfAnnotation, scale: number) {
  const common = {
    left: annotation.x * scale,
    top: annotation.y * scale,
    opacity: annotation.opacity || 1,
  };

  if (annotation.annotationType === 'note') {
    const note = new Textbox(annotation.text || '备注', {
      ...common,
      width: Math.max(80, annotation.width * scale),
      fontSize: 14,
      fill: annotation.color,
      backgroundColor: 'rgba(255,255,255,0.72)',
    });
    attachExistingMetadata(note, annotation);
    return note;
  }

  if (annotation.annotationType === 'ink') {
    const points = annotation.points.length > 0
      ? annotation.points
      : [{ x: annotation.x, y: annotation.y }, { x: annotation.x + annotation.width, y: annotation.y + annotation.height }];
    const path = points.map((point, index) => (
      `${index === 0 ? 'M' : 'L'} ${point.x * scale} ${point.y * scale}`
    )).join(' ');
    const object = new FabricPath(path, {
      fill: '',
      stroke: annotation.color,
      strokeWidth: annotation.lineWidth || 2,
      opacity: annotation.opacity || 1,
    });
    attachExistingMetadata(object, annotation);
    return object;
  }

  const object = new Rect({
    ...common,
    width: Math.max(1, annotation.width * scale),
    height: Math.max(1, annotation.height * scale),
    fill: annotation.annotationType === 'highlight' ? hexToRgba(annotation.color, annotation.opacity || 0.32) : 'transparent',
    stroke: annotation.color,
    strokeWidth: annotation.annotationType === 'highlight' ? 0 : annotation.lineWidth || 2,
  });
  attachExistingMetadata(object, annotation);
  return object;
}

function attachExistingMetadata(object: unknown, annotation: PdfAnnotation) {
  const target = object as Record<string, unknown>;
  target.kindeditType = annotation.annotationType;
  target.kindeditId = annotation.id;
  target.pageNumber = annotation.pageNumber;
}

function extractAnnotationsFromCanvas(fabric: FabricCanvas, pageNumber: number, scale: number): PdfAnnotation[] {
  return fabric.getObjects().map((object) => {
    const typed = object as typeof object & Record<string, unknown>;
    const annotationType = (typed.kindeditType as PdfAnnotationType | undefined) || inferAnnotationType(object);
    const id = (typed.kindeditId as string | undefined) || createId('pdf-annotation');
    typed.kindeditId = id;
    typed.kindeditType = annotationType;
    typed.pageNumber = pageNumber;

    const left = (object.left || 0) / scale;
    const top = (object.top || 0) / scale;
    const width = object.getScaledWidth() / scale;
    const height = object.getScaledHeight() / scale;
    const stroke = typeof object.stroke === 'string' ? object.stroke : '#f4c542';
    const fill = typeof object.fill === 'string' ? object.fill : stroke;
    const color = annotationType === 'highlight' ? rgbaToHex(fill) || stroke : stroke;

    return {
      id,
      pageNumber,
      annotationType,
      x: left,
      y: top,
      width,
      height,
      color,
      opacity: object.opacity ?? (annotationType === 'highlight' ? 0.32 : 1),
      lineWidth: typeof object.strokeWidth === 'number' ? object.strokeWidth : 2,
      text: object instanceof Textbox ? object.text || '' : null,
      points: object instanceof FabricPath ? extractPathPoints(object, scale) : rectPoints(left, top, width, height),
      fabricJson: object.toObject(['kindeditType', 'kindeditId', 'pageNumber']),
    };
  });
}

function inferAnnotationType(object: { type?: string; fill?: unknown }): PdfAnnotationType {
  if (object instanceof Textbox) return 'note';
  if (object instanceof FabricPath) return 'ink';
  if (typeof object.fill === 'string' && object.fill.startsWith('rgba')) return 'highlight';
  return 'rect';
}

function extractPathPoints(object: FabricPath, scale: number): PdfPoint[] {
  const path = object.path || [];
  const left = object.left || 0;
  const top = object.top || 0;
  return path
    .filter((command) => command[0] === 'M' || command[0] === 'L')
    .map((command) => ({
      x: (left + Number(command[1] || 0)) / scale,
      y: (top + Number(command[2] || 0)) / scale,
    }));
}

function rectPoints(x: number, y: number, width: number, height: number): PdfPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbaToHex(value: string): string | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return value.startsWith('#') ? value : null;
  const [, r, g, b] = match;
  return `#${[r, g, b].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

export default PdfViewer;
