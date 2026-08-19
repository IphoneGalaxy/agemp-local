import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. Cabeçalhos de Segurança HTTP (Proteção CSP, Sniffing, Frame e Referrer)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' blob: data: https://unpkg.com https://cdn.jsdelivr.net; worker-src 'self' blob:; object-src 'none'; base-uri 'self';"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// 2. Proteção contra Exposição de Arquivos Sensíveis na Raiz
// Bloqueia tentativas de acesso direto a arquivos de configuração, backups, variáveis de ambiente e documentação
const SENSITIVE_PATTERNS = [
  /^\/\..+/,                    // Arquivos ocultos (ex: .env, .git)
  /\.(json|env|md|yml|yaml|lock)$/i, // Arquivos de backup, configurações e metadados
  /^\/server\.(js|ts|cjs|mjs)$/i, // Código-fonte do servidor
  /^\/package(-lock)?\.json$/i   // Manifesto de pacotes
];

app.use((req, res, next) => {
  let reqPath = req.path;
  try {
    reqPath = decodeURIComponent(req.path);
  } catch (e) {
    return res.status(400).send('Requisição inválida');
  }
  const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(reqPath));
  if (isSensitive) {
    return res.status(403).send('Acesso proibido');
  }
  next();
});

// 3. Servir apenas diretórios públicos autorizados
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: 0, dotfiles: 'deny' }));
app.use('/js', express.static(path.join(__dirname, 'js'), { maxAge: 0, dotfiles: 'deny' }));

// 4. Rota principal e fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

