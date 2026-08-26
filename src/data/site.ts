// Constantes de marca/config (patron data/site.ts de Web Rutas Raices).
export const SITE = {
  marca: 'CRM Empleo',
  // Titular que aparece en la cabecera (Empleo <titular>). Cámbialo por tu nombre o marca.
  titular: 'MiBúsqueda',
  dominio: 'https://empleo.example.com',
  // Base de los webhooks de n8n (server-side; nunca se expone al navegador). Configúralo en .env.
  n8nWebhookBase: import.meta.env.N8N_WEBHOOK_BASE ?? '',
} as const;

// Etiquetas y orden del pipeline (mapea job_offers.status + applications.stage).
export const ESTADOS = [
  { key: 'evaluada', label: 'Abiertas' },
  { key: 'notificada', label: 'Abiertas' },
  { key: 'generada', label: 'CV listo' },
  { key: 'aplicada', label: 'Postuladas' },
  { key: 'descartada', label: 'Descartadas' },
] as const;
