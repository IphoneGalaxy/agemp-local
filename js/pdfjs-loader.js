window.pdfjsReady = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs')
    .then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs';
        window.pdfjsLib = pdfjsLib;
        return pdfjsLib;
    });
