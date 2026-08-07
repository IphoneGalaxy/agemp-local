// O leitor é servido junto com o aplicativo. Isso evita que navegadores móveis
// bloqueiem ou atrasem o módulo externo no momento em que um contrato é escolhido.
window.pdfjsReady = import(new URL('./js/vendor/pdfjs/pdf.min.mjs', document.baseURI).href)
    .then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            './js/vendor/pdfjs/pdf.worker.min.mjs',
            document.baseURI
        ).href;
        window.pdfjsLib = pdfjsLib;
        return pdfjsLib;
    })
    .catch((error) => {
        window.pdfjsLoadError = error;
        throw error;
    });
