// pdf.js bootstrap. Configures the worker and re-exports the library so the
// rest of the app imports a single, correctly-initialised entry point.

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }
