// Platzhalter Plan. Wird durch den echten Social Media Plan ersetzt (PUT /api/plan oder Dashboard).
export const DEFAULT_PLAN = {
  placeholder: true,
  title: 'Social Media Plan Zipperwalls',
  stand: '2026-10-01',
  goals: [
    { title: 'Sichtbarkeit', text: 'Zipperwalls als Fachanbieter für Messewände bei Ausstellern und Agenturen bekannt machen.' },
    { title: 'Anfragen', text: 'Regelmäßig qualifizierte Anfragen über Website und Direktnachrichten erzeugen.' },
    { title: 'Vertrauen', text: 'Mit Praxiswissen, Referenzen und Einblicken in Produktion und Aufbau Seriosität zeigen.' },
  ],
  channels: [
    { name: 'LinkedIn', role: 'Fachpublikum, Agenturen, Messeverantwortliche', frequency: '2 Posts pro Woche' },
    { name: 'Instagram', role: 'Bildwirkung, Referenzen, Aufbauvideos', frequency: '2 Posts pro Woche' },
    { name: 'Facebook', role: 'Reichweite, lokale Sichtbarkeit, Referenzen', frequency: '2 Posts pro Woche' },
  ],
  rhythm: { postsPerWeek: 2, days: ['Dienstag', 'Donnerstag'], time: '10:00', approval: 'Freigabe durch Bela oder Darien im Dashboard' },
  pillars: [
    { name: 'Produkt und Aufbau', share: 30, text: 'Aufbau in Minuten, werkzeuglos, Materialien, Maße.' },
    { name: 'Referenzen', share: 30, text: 'Messestände von Kunden, Vorher und Nachher.' },
    { name: 'Messe Know-how', share: 25, text: 'Tipps zu Planung, Druckdaten, Transport, Kosten.' },
    { name: 'Hinter den Kulissen', share: 15, text: 'Produktion, Team, Qualitätssicherung.' },
  ],
  phases: [
    { name: 'Phase 1: Fundament', period: 'Woche 1 bis 2', items: ['Konten verbinden', 'Dashboard und Freigabe testen', 'Profile vereinheitlichen'] },
    { name: 'Phase 2: Rhythmus', period: 'Woche 3 bis 8', items: ['Zwei Posts pro Woche', 'Wöchentliche Zahlenprüfung', 'Formate testen'] },
    { name: 'Phase 3: Optimieren', period: 'ab Woche 9', items: ['Beste Formate ausbauen', 'Anfragequellen auswerten', 'Plan anpassen'] },
  ],
  kpis: [
    { name: 'Follower Wachstum pro Monat', target: '+5 %' },
    { name: 'Interaktionsrate', target: 'ab 3 %' },
    { name: 'Anfragen über Social Media pro Monat', target: '5' },
  ],
};

export const WEEKLY_TEMPLATE = [
  'Entwurf 1 prüfen und freigeben',
  'Entwurf 2 prüfen und freigeben',
  'Kommentare und Nachrichten beantworten',
  'Zahlen der Woche ansehen',
];

export const SETUP_TEMPLATE = [
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
