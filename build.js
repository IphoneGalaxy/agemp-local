import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('js/dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

const files = [
    'js/icons.js',
    'js/components/AuthScreen.js',
    'js/components/BankSummary.js',
    'js/components/SourcesList.js',
    'js/components/ClientsList.js',
    'js/components/ClientView.js',
    'js/components/SuppliersList.js',
    'js/components/PlanningView.js',
    'js/components/Dashboard.js',
    'js/app.js',
    'js/main.js'
];

try {
    const concatenated = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n;\n');
    const result = await esbuild.transform(concatenated, {
        loader: 'jsx',
        target: 'es2020',
        minify: true,
        sourcemap: false
    });

    fs.writeFileSync(path.join(distDir, 'app.bundle.js'), result.code);
    console.log('✅ Bundle React/JSX pré-compilado e minificado com sucesso em js/dist/app.bundle.js!');
} catch (error) {
    console.error('Erro ao compilar bundle:', error);
    process.exit(1);
}
