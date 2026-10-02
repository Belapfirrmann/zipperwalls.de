// Kurzfassung der Einrichtung fuer das Dashboard (Bereich "Verbindungen").
// Ausfuehrlich in docs/SETUP.md. Beide bei Aenderungen gemeinsam pflegen.
export const SETUP_STEPS = [
  {
    title: 'Facebook und Instagram',
    steps: [
      'Instagram @zipperwalls.de als Business Konto führen und in der Meta Business Suite mit der Facebook Seite verknüpfen.',
      'Auf developers.facebook.com eine App vom Typ „Business“ anlegen. Bela und Darien als Admin eintragen. Die App kann im Entwicklungsmodus bleiben.',
      'Im Graph API Explorer die App wählen und ein User Token erzeugen mit: pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_insights, business_management.',
      'Token im Access Token Tool verlängern und den langen Token im Explorer einsetzen.',
      'Abfrage me/accounts?fields=id,name,access_token,instagram_business_account ausführen. Aus der Zeile der Zipperwalls Seite: access_token = META_PAGE_TOKEN, id = META_PAGE_ID, instagram_business_account.id = IG_USER_ID.',
    ],
  },
  {
    title: 'LinkedIn',
    steps: [
      'Auf linkedin.com/developers eine App anlegen und mit der Zipperwalls Unternehmensseite verbinden.',
      'Unter „Products“ die Produkte „Share on LinkedIn“ und „Sign In with LinkedIn using OpenID Connect“ hinzufügen.',
      'Unter „Docs and tools“ > „OAuth Token Tools“ ein Token mit openid, profile, w_member_social erzeugen. Das Token = LINKEDIN_TOKEN, Ablaufdatum (60 Tage) = LINKEDIN_TOKEN_EXPIRES, z. B. 2026-12-01.',
    ],
  },
  {
    title: 'In Claude eintragen',
    steps: [
      'Die Vorlage docs/Zugangsdaten-Vorlage.txt im Editor öffnen und hinter jedes = den Wert schreiben.',
      'In der Claude Code Sitzung oben auf die Cloud Umgebung klicken > „Bearbeiten“ > Umgebungsvariablen: den ganzen Text einfügen. Danach die ausgefüllte Datei löschen, Tokens nie in den Chat kopieren.',
      'Unter Netzwerkzugriff erlauben: graph.facebook.com, api.linkedin.com, www.linkedin.com.',
      'Claude Bescheid geben. Claude prüft die Zugänge, das Ergebnis erscheint hier oben.',
    ],
  },
];
