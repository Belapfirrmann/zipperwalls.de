// Kurzfassung der Einrichtung fuer das Dashboard (Bereich "Verbindungen").
// Ausfuehrlich in docs/SETUP.md. Beide bei Aenderungen gemeinsam pflegen.
export const SETUP_STEPS = [
  {
    title: 'Facebook und Instagram',
    steps: [
      'Instagram @zipperwalls.de als Business Konto führen und in der Meta Business Suite mit der Facebook Seite verknüpfen.',
      'Auf developers.facebook.com eine App erstellen. Bela und Darien als Admin eintragen. Die App bleibt im Entwicklungsmodus, ein App Review ist nicht nötig.',
      'Wichtig: Berechtigungen erscheinen im Graph API Explorer erst, wenn die App den passenden Anwendungsfall hat. Deshalb zuerst die nächsten zwei Schritte.',
      'Anwendungsfall „Alles auf deiner Seite verwalten“ (Manage everything on your Page) hinzufügen > Anpassen > pages_manage_posts und pages_read_engagement hinzufügen.',
      'Anwendungsfall „Nachrichten und Inhalte auf Instagram verwalten“ hinzufügen > „API-Einrichtung mit Facebook-Login“ wählen > instagram_basic, instagram_content_publish und instagram_manage_insights hinzufügen.',
      'Im Graph API Explorer die App wählen, User Token erzeugen, alle diese Rechte anhaken und im Facebook Fenster die Zipperwalls Seite und das Instagram Konto auswählen.',
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
