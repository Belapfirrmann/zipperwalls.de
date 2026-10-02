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
  'Instagram auf Business Konto umstellen und mit der Facebook Seite verknüpfen',
  'Meta Developer App anlegen (Bela und Darien als Admin)',
  'Facebook Seiten-Token und IDs holen (Graph API Explorer)',
  'LinkedIn Developer App anlegen, "Share on LinkedIn" und "Sign In with LinkedIn" hinzufügen',
  'LinkedIn Token holen (Token Generator, gilt 60 Tage)',
  'Zugangsdaten als Umgebungsvariablen in der Claude Umgebung eintragen',
  'Netzwerkzugriff für Facebook und LinkedIn in der Claude Umgebung freigeben',
  'Claude Routinen einrichten (Posten, Entwürfe, Zahlen)',
  'Testpost auf allen Kanälen freigeben',
];
