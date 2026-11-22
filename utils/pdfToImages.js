/**
 * Convert PDF pages to PNG buffers for OCR.
 * Uses pdfjs-dist + @napi-rs/canvas (prebuilt natives) instead of
 * the old `canvas` package that breaks on newer Node versions.
 */
const fs = require('fs');
const path = require('path');

const convertPdfToImages = async (filePath, options = {}) => {
  const targetWidth = options.width || 2200;
  const pdfjsPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = getDocument({
    data,
    disableWorker: true,
    useSystemFonts: true,
    standardFontDataUrl: path.join(pdfjsPath, 'standard_fonts') + path.sep,
    cMapUrl: path.join(pdfjsPath, 'cmaps') + path.sep,
    cMapPacked: true,
  });

  const pdfDocument = await loadingTask.promise;
  const images = [];

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvasAndContext = pdfDocument.canvasFactory.create(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
    }).promise;

    images.push(canvasAndContext.canvas.toBuffer('image/png'));

    if (typeof pdfDocument.canvasFactory.destroy === 'function') {
      pdfDocument.canvasFactory.destroy(canvasAndContext);
    }
    page.cleanup();
  }

  return images;
};

module.exports = { convertPdfToImages };
