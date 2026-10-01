// Der Plan kommt aus dem Redaktionsplan (xlsx), eingelesen mit scripts/import_plan.py
export { REDAKTIONSPLAN as PLAN } from './redaktionsplan.js';

export const WEEKLY_TEMPLATE = [
  'Entwurf 1 prüfen und freigeben',
  'Entwurf 2 prüfen und freigeben',
  'Kommentare und Nachrichten beantworten',
  'Zahlen der Woche ansehen',
];

export const SETUP_TEMPLATE = [
  'Instagram Konto @zipperwalls.de anlegen, Facebook Infos (Adresse, Telefon, Öffnungszeiten) korrigieren',
  'Cloudflare Access einrichten (Login für Bela und Darien)',
  'Worker Secrets setzen (Agent Token, Verschlüsselungsschlüssel)',
  'Instagram auf Business oder Creator Konto umstellen und mit der Facebook Seite verknüpfen',
  'Meta Developer App anlegen und Secrets eintragen',
  'Facebook und Instagram im Dashboard verbinden',
  'LinkedIn Developer App anlegen, Produkt "Share on LinkedIn" hinzufügen',
  'LinkedIn im Dashboard verbinden',
  'Optional: Community Management API bei LinkedIn beantragen (für Unternehmensseite und Zahlen)',
  'Agent Token im Claude Projekt hinterlegen (docs/AGENT-API.md)',
  'Testpost auf allen Kanälen freigeben',
];
